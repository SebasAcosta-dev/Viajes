"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { InterestPicker } from "@/app/components/interest-picker";
import { defaultProfile, destinations } from "@/app/data/demo-data";
import { generateItineraryFromTrip } from "@/app/lib/itinerary";
import { addDailySchedules } from "@/app/lib/itinerary-schedule";
import { validateTripForm } from "@/app/lib/validators";
import { getPlannerDraftScope, getProfilePreferences } from "@/app/lib/persistence/profile-client";
import { listFavorites, listTrips, persistenceLabel, toggleFavorite as persistFavorite } from "@/app/lib/persistence/client";
import { allTravelInterests, resolveTripInterests } from "@/app/lib/interest-catalog";
import { loadGeneratedItinerary, loadTripFormDraft, saveGeneratedItinerary, saveTripFormDraft } from "@/app/lib/generated-itinerary";
import type { FavoriteDestination, SavedTrip } from "@/app/lib/persistence/types";
import type { Destination, ProfilePreferences, TripFormValues } from "@/app/lib/types";

const defaultForm: TripFormValues = {
  origin: "Madrid",
  destination: "Marrakech",
  startDate: "2026-04-12",
  endDate: "2026-04-16",
  travelers: 2,
  budget: 800,
  currency: "EUR",
  interests: [],
  travelType: "Cultural",
  pace: "equilibrado",
  notes: "Quiero una mezcla de historia, gastronomía y paseo por la ciudad.",
};

export function TravelHome() {
  const router = useRouter();
  const [form, setForm] = useState<TripFormValues>(defaultForm);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [interestSelectionTouched, setInterestSelectionTouched] = useState(false);
  const interestSelectionTouchedRef = useRef(false);
  const hasSavedFormRef = useRef(false);
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<Destination>(destinations[0]);
  const [favorites, setFavorites] = useState<FavoriteDestination[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [persistenceError, setPersistenceError] = useState("");
  const [profile, setProfile] = useState<ProfilePreferences>(defaultProfile);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [hasGeneratedItinerary, setHasGeneratedItinerary] = useState(false);

  useEffect(() => {
    let active = true;
    void getPlannerDraftScope()
      .then((scope) => {
        if (!active) return;
        setDraftScope(scope);
        setHasGeneratedItinerary(loadGeneratedItinerary(scope) !== null);
        const savedForm = loadTripFormDraft(scope);
        hasSavedFormRef.current = savedForm !== null;
        if (savedForm) {
          setForm(savedForm);
          if (scope === "anonymous") {
            setCustomInterests(savedForm.interests.filter((interest) => !(allTravelInterests as readonly string[]).includes(interest)));
            interestSelectionTouchedRef.current = true;
            setInterestSelectionTouched(true);
          }
        }
        return getProfilePreferences()
          .then((savedProfile) => {
            if (!active) return;
            setProfile(savedProfile);
            if (!interestSelectionTouchedRef.current && (!hasSavedFormRef.current || scope !== "anonymous")) {
              setCustomInterests(savedProfile.interests.filter((interest) => !(allTravelInterests as readonly string[]).includes(interest)));
              setForm((current) => ({
                ...current,
                ...(!hasSavedFormRef.current ? { currency: savedProfile.currency, pace: savedProfile.pace } : {}),
                interests: savedProfile.interests.filter((interest) => (allTravelInterests as readonly string[]).includes(interest)),
              }));
            }
          })
          .catch((error: unknown) => {
            if (active && error instanceof Error && !error.message.includes("Inicia sesión")) setPersistenceError(error.message);
          });
      })
      .catch((error: unknown) => {
        if (active) setPersistenceError(error instanceof Error ? error.message : "No se pudo recuperar el borrador local.");
      });
    void Promise.all([listFavorites(), listTrips()])
      .then(([savedFavorites, trips]) => {
        if (!active) return;
        setFavorites(savedFavorites);
        setSavedTrips(trips);
      })
      .catch((error: unknown) => {
        if (active) setPersistenceError(error instanceof Error ? error.message : "No se pudieron cargar los datos guardados.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftScope) return;
    void Promise.resolve()
      .then(() => saveTripFormDraft({ ...form, interests: resolveTripInterests(form.interests, [], customInterests) }, draftScope))
      .catch((error: unknown) => setPersistenceError(error instanceof Error ? error.message : "No se pudo guardar el borrador del formulario."));
  }, [form, customInterests, draftScope]);

  const filteredDestinations = useMemo(() => {
    return destinations.filter((destination) =>
      destination.name.toLowerCase().includes(form.destination.toLowerCase()) ||
      destination.country.toLowerCase().includes(form.destination.toLowerCase()) ||
      destination.categories.some((category) => category.toLowerCase().includes(form.destination.toLowerCase())),
    );
  }, [form.destination]);

  const itineraryPreview = useMemo(() => {
    const interests = interestSelectionTouched
      ? resolveTripInterests(form.interests, [], customInterests)
      : profile.interests;
    return generateItineraryFromTrip(selectedDestination, { ...form, interests });
  }, [selectedDestination, form, profile.interests, interestSelectionTouched, customInterests]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isGenerating || !draftScope) return;
    setGenerationError("");
    const interests = interestSelectionTouched
      ? resolveTripInterests(form.interests, [], customInterests)
      : profile.interests;
    const requestForm = { ...form, interests };
    const validationErrors = validateTripForm(requestForm);
    setErrors(validationErrors);
    if (validationErrors.length) return;
    setIsGenerating(true);
    try {
      const durationDays = Math.floor(
        (Date.parse(`${form.endDate}T00:00:00Z`) - Date.parse(`${form.startDate}T00:00:00Z`)) / 86_400_000,
      ) + 1;
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Organiza un itinerario de ${durationDays} días para ${form.destination}, priorizando estos intereses: ${interests.join(", ")}. ${form.notes}`.trim(),
          context: {
            origin: form.origin,
            destination: form.destination,
            startDate: form.startDate,
            endDate: form.endDate,
            travelers: form.travelers,
            interests,
            budget: form.budget,
            currency: form.currency,
            travelType: form.travelType,
            pace: form.pace,
            notes: form.notes,
          },
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "No se pudo generar el itinerario. Vuelve a intentarlo.";
        throw new Error(errorMessage);
      }
      if (typeof data !== "object" || data === null || !("source" in data)) {
        throw new Error("El asistente devolvió una respuesta incompleta. Vuelve a intentarlo.");
      }
      let itinerary = "itinerary" in data && typeof data.itinerary === "object" && data.itinerary !== null
        ? data.itinerary as import("@/app/lib/ai").ItineraryPlan
        : undefined;
      const source = data.source === "openrouter" ? "openrouter" : "demo";
      if (!itinerary && source === "demo") {
        const destination = destinations.find((entry) => entry.name.toLocaleLowerCase("es") === form.destination.toLocaleLowerCase("es"));
        if (destination) {
          const scheduledDays = addDailySchedules(generateItineraryFromTrip(destination, requestForm));
          if (!scheduledDays) throw new Error("Las actividades de demostración no caben en un horario de 09:00 a 21:00.");
          itinerary = {
            destination: destination.name,
            durationDays,
            startDate: form.startDate,
            endDate: form.endDate,
            travelers: form.travelers,
            budget: { total: form.budget, currency: form.currency, status: "provided" },
            days: scheduledDays,
          };
        }
      }
      if (!itinerary) {
        const warning = "warning" in data && typeof data.warning === "string" ? ` ${data.warning}` : "";
        throw new Error(`El asistente no generó un itinerario válido.${warning}`);
      }
      const savedForm = { ...requestForm, interests };
      saveTripFormDraft(savedForm, draftScope);
      saveGeneratedItinerary({
        form: savedForm,
        itinerary,
        source,
        ...("model" in data && typeof data.model === "string" ? { model: data.model } : {}),
        generatedAt: new Date().toISOString(),
      }, draftScope);
      setHasGeneratedItinerary(true);
      router.push("/itinerario");
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "No se pudo generar el itinerario. Vuelve a intentarlo.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleFavorite = async (destination: Destination) => {
    setPersistenceError("");
    try {
      setFavorites(await persistFavorite(destination.slug, destination.name));
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : "No se pudo guardar el favorito.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex w-full max-w-screen-2xl flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-8 lg:px-8 2xl:px-10">
        <section className="grid min-w-0 gap-6 rounded-3xl bg-gradient-to-br from-emerald-600 via-cyan-600 to-sky-700 p-5 text-white shadow-xl sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:gap-8">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs uppercase tracking-[0.2em]">Descubre y organiza</p>
            <h2 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl xl:text-5xl">Crea tu próxima aventura con ayuda inteligente.</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-emerald-50/90">
              Encuentra destinos, planifica itinerarios y gestiona presupuestos con un flujo pensado para viajar mejor en España y Europa.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/planificar" className="rounded-full bg-white px-5 py-3 font-semibold text-emerald-700">Planificar viaje</Link>
              <Link href="/ia" className="rounded-full border border-white/40 bg-white/10 px-5 py-3 font-semibold">Asistente IA</Link>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-950/15 p-5 shadow-inner ring-1 ring-white/20">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-50/80">Resumen del viaje</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span>Origen</span><span>{form.origin}</span></div>
              <div className="flex items-center justify-between"><span>Destino</span><span>{form.destination}</span></div>
              <div className="flex items-center justify-between"><span>Personas</span><span>{form.travelers}</span></div>
              <div className="flex items-center justify-between"><span>Presupuesto</span><span>{form.budget} {form.currency}</span></div>
            </div>
          </div>
        </section>
        {hasGeneratedItinerary && (
          <Link href="/itinerario" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            Abrir el último itinerario generado
          </Link>
        )}

        <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)] 2xl:gap-8">
          <form onSubmit={handleSubmit} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-semibold sm:text-2xl">Formulario rápido</h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">{persistenceLabel()}</span>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:gap-x-5 xl:gap-y-4">
              <label className="text-sm font-medium text-slate-700">
                Origen
                <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Destino
                <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Fecha de salida
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Fecha de regreso
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Viajeros
                <input type="number" min={1} value={form.travelers} onChange={(e) => setForm({ ...form, travelers: Number(e.target.value) || 1 })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Presupuesto para actividades y visitas
                <input type="number" min={1} value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) || 1 })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Moneda
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as TripFormValues["currency"] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="MAD">MAD</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Tipo de viaje
                <select value={form.travelType} onChange={(e) => setForm({ ...form, travelType: e.target.value as TripFormValues["travelType"] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">
                  <option value="Cultural">Cultural</option>
                  <option value="Económico">Económico</option>
                  <option value="Gastronómico">Gastronómico</option>
                  <option value="Naturaleza">Naturaleza</option>
                  <option value="Relax">Relax</option>
                  <option value="Aventura">Aventura</option>
                  <option value="Familiar">Familiar</option>
                  <option value="Combinado">Combinado</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Ritmo
                <select value={form.pace} onChange={(e) => setForm({ ...form, pace: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">
                  <option value="lento">Tranquilo</option>
                  <option value="equilibrado">Equilibrado</option>
                  <option value="rápido">Activo</option>
                </select>
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Intereses para este viaje</p>
              <p className="mb-3 text-xs text-slate-500">Si no cambias los intereses sugeridos, se usarán los de tu perfil. Puedes seleccionar tantos como quieras.</p>
              <InterestPicker
                selected={form.interests.filter((interest) => (allTravelInterests as readonly string[]).includes(interest))}
                customInterests={customInterests}
                onSelectedChange={(interests) => {
                  interestSelectionTouchedRef.current = true;
                  setInterestSelectionTouched(true);
                  setForm({ ...form, interests });
                }}
                onCustomInterestsChange={(interests) => {
                  interestSelectionTouchedRef.current = true;
                  setInterestSelectionTouched(true);
                  setCustomInterests(interests);
                }}
              />
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Notas para personalizar el viaje
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={1000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </label>
            <p className="mt-2 text-xs text-slate-500">El presupuesto cubre solo visitas y actividades turísticas. No incluye transporte, alojamiento, compras personales ni comidas.</p>

            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Previsualización del itinerario</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {itineraryPreview.slice(0, 3).map((day) => (
                  <li key={day.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span>{day.theme}</span>
                    <span>{day.items.length} actividades</span>
                  </li>
                ))}
              </ul>
            </div>

            {errors.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <ul className="list-disc space-y-1 pl-5">
                  {errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}

            {generationError && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
                {generationError}
              </p>
            )}

            <button type="submit" disabled={isGenerating || !draftScope} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">
              {isGenerating ? "Generando itinerario…" : !draftScope ? "Cargando preferencias…" : "Generar itinerario"}
            </button>
          </form>

          <aside className="grid min-w-0 content-start gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Preferencias del perfil</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p><span className="font-medium text-slate-800">Nombre:</span> {profile.name}</p>
                <p><span className="font-medium text-slate-800">Moneda:</span> {profile.currency}</p>
                <p><span className="font-medium text-slate-800">Pace:</span> {profile.pace}</p>
                <p><span className="font-medium text-slate-800">Tipos favoritos:</span> {profile.travelTypes.join(", ")}</p>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Favoritos</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {favorites.map((favorite) => (
                  <span key={favorite.id} className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">{favorite.destinationName}</span>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">Viajes guardados</h3>
              <div className="mt-4 space-y-3">
                {savedTrips.slice(0, 3).map((trip) => (
                  <div key={trip.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-800">{trip.name}</p>
                    <p className="text-sm text-slate-500">{trip.destination} · {trip.status}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
        {persistenceError && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
            {persistenceError} {persistenceError.includes("Inicia sesión") && <Link className="font-semibold underline" href="/cuenta">Iniciar sesión</Link>}
          </p>
        )}

        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-semibold">Destinos destacados</h3>
            <Link href="/destinos" className="text-sm font-medium text-emerald-700">Ver catálogo</Link>
          </div>
          <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredDestinations.map((destination) => (
              <article key={destination.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="h-44 bg-cover bg-center" style={{ backgroundImage: `url(${destination.image})` }} />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="text-lg font-semibold">{destination.name}</h4>
                    <button type="button" onClick={() => void toggleFavorite(destination)} className={`rounded-full px-2 py-1 text-xs font-medium ${favorites.some((favorite) => favorite.destinationSlug === destination.slug) ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                      {favorites.some((favorite) => favorite.destinationSlug === destination.slug) ? "Favorito" : "Guardar"}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{destination.country} · {destination.region}</p>
                  <p className="mt-2 text-sm text-slate-600">{destination.description}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{destination.bestSeason}</span>
                    <span>{destination.budgetEstimate} €</span>
                  </div>
                  <button type="button" onClick={() => setSelectedDestination(destination)} className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">Ver destino</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-2xl font-semibold">Mapa conceptual</h3>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">Leaflet + OpenStreetMap</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-700">
              <p><span className="font-semibold text-slate-900">Destino activo:</span> {selectedDestination.name}</p>
              <p className="mt-2"><span className="font-semibold text-slate-900">Coordenadas:</span> {selectedDestination.lat.toFixed(4)}, {selectedDestination.lng.toFixed(4)}</p>
              <p className="mt-2"><span className="font-semibold text-slate-900">Información:</span> {selectedDestination.sourceLabel}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-6 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Lugares relevantes</p>
              <ul className="mt-2 list-disc pl-5">
                {selectedDestination.places.slice(0,3).map((place) => (
                  <li key={place.id}>{place.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
