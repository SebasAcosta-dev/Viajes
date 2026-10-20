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
import { listFavorites, listTripSummaries, persistenceLabel, toggleFavorite as persistFavorite } from "@/app/lib/persistence/client";
import { allTravelInterests, resolveTripInterests } from "@/app/lib/interest-catalog";
import { loadGeneratedItinerary, loadTripFormDraft, saveGeneratedItinerary, saveTripFormDraft } from "@/app/lib/generated-itinerary";
import { formatTripPeriod } from "@/app/lib/date-format";
import { localTodayIso, normalizeNewDateRange } from "@/app/lib/trip-dates";
import { useLocalToday } from "@/app/hooks/use-local-today";
import type { FavoriteDestination, SavedTripSummary } from "@/app/lib/persistence/types";
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

function updateNewTripDates(form: TripFormValues, startDate: string, endDate: string, today: string): TripFormValues {
  const dates = normalizeNewDateRange(startDate, endDate, today);
  return { ...form, ...dates };
}

export function TravelHome() {
  const router = useRouter();
  const today = useLocalToday();
  const [form, setForm] = useState<TripFormValues>(defaultForm);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [interestSelectionTouched, setInterestSelectionTouched] = useState(false);
  const interestSelectionTouchedRef = useRef(false);
  const hasSavedFormRef = useRef(false);
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<Destination>(destinations[0]);
  const [favorites, setFavorites] = useState<FavoriteDestination[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTripSummary[]>([]);
  const [persistenceError, setPersistenceError] = useState("");
  const [profile, setProfile] = useState<ProfilePreferences>(defaultProfile);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [hasGeneratedItinerary, setHasGeneratedItinerary] = useState(false);

  useEffect(() => {
    let active = true;
    void getPlannerDraftScope()
      .then(async (scope) => {
        if (!active) return;
        setDraftScope(scope);
        setHasGeneratedItinerary(loadGeneratedItinerary(scope) !== null);
        const savedForm = loadTripFormDraft(scope);
        hasSavedFormRef.current = savedForm !== null;
        if (savedForm) {
          setForm((current) => {
            const dates = normalizeNewDateRange(savedForm.startDate, savedForm.endDate, localTodayIso());
            return { ...current, ...savedForm, ...dates };
          });
          if (scope === "anonymous" || scope.startsWith("anonymous:")) {
            setCustomInterests(savedForm.interests.filter((interest) => !(allTravelInterests as readonly string[]).includes(interest)));
            interestSelectionTouchedRef.current = true;
            setInterestSelectionTouched(true);
          }
        }
        const [profileResult, tripData] = await Promise.all([
          getProfilePreferences().then((savedProfile) => ({ profile: savedProfile })).catch((error: unknown) => ({ error })),
          Promise.all([listFavorites(), listTripSummaries()]),
        ]);
        if (!active) return;
        setFavorites(tripData[0]);
        setSavedTrips(tripData[1]);
        if ("error" in profileResult) {
          if (profileResult.error instanceof Error && !profileResult.error.message.includes("Inicia sesión")) {
            setPersistenceError(profileResult.error.message);
          }
          return;
        }
        const savedProfile = profileResult.profile;
        setProfile(savedProfile);
        if (!interestSelectionTouchedRef.current && (!hasSavedFormRef.current || (scope !== "anonymous" && !scope.startsWith("anonymous:")))) {
          setCustomInterests(savedProfile.interests.filter((interest) => !(allTravelInterests as readonly string[]).includes(interest)));
          setForm((current) => ({
            ...current,
            ...(!hasSavedFormRef.current ? { currency: savedProfile.currency, pace: savedProfile.pace } : {}),
            interests: savedProfile.interests.filter((interest) => (allTravelInterests as readonly string[]).includes(interest)),
          }));
        }
      })
      .catch((error: unknown) => {
        if (active) setPersistenceError(error instanceof Error ? error.message : "No se pudo recuperar el borrador local.");
      });
    return () => { active = false; };
  }, []);

  const effectiveForm = useMemo(() => ({
    ...form,
    ...normalizeNewDateRange(form.startDate, form.endDate, today),
  }), [form, today]);

  useEffect(() => {
    if (!draftScope) return;
    void Promise.resolve()
      .then(() => saveTripFormDraft({ ...effectiveForm, interests: resolveTripInterests(effectiveForm.interests, [], customInterests) }, draftScope))
      .catch((error: unknown) => setPersistenceError(error instanceof Error ? error.message : "No se pudo guardar el borrador del formulario."));
  }, [effectiveForm, customInterests, draftScope]);

  const filteredDestinations = useMemo(() => {
    return destinations.filter((destination) =>
      destination.name.toLowerCase().includes(form.destination.toLowerCase()) ||
      destination.country.toLowerCase().includes(form.destination.toLowerCase()) ||
      destination.categories.some((category) => category.toLowerCase().includes(form.destination.toLowerCase())),
    );
  }, [form.destination]);

  const itineraryPreview = useMemo(() => {
    const interests = interestSelectionTouched
      ? resolveTripInterests(effectiveForm.interests, [], customInterests)
      : profile.interests;
    return generateItineraryFromTrip(selectedDestination, { ...effectiveForm, interests });
  }, [selectedDestination, effectiveForm, profile.interests, interestSelectionTouched, customInterests]);
  const upcomingTrips = useMemo(() => {
    return savedTrips
      .filter((trip) => trip.startDate && (!trip.endDate || trip.endDate >= today))
      .sort((left, right) => (left.startDate ?? "").localeCompare(right.startDate ?? ""));
  }, [savedTrips, today]);
  const upcomingBudgets = useMemo(() => {
    const totals = new Map<string, number>();
    for (const trip of upcomingTrips) {
      totals.set(trip.currency, (totals.get(trip.currency) ?? 0) + trip.budget);
    }
    return [...totals.entries()];
  }, [upcomingTrips]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isGenerating || !draftScope) return;
    setGenerationError("");
    const interests = interestSelectionTouched
      ? resolveTripInterests(effectiveForm.interests, [], customInterests)
      : profile.interests;
    const requestForm = { ...effectiveForm, interests };
    const validationErrors = validateTripForm(requestForm);
    setErrors(validationErrors);
    if (validationErrors.length) return;
    setIsGenerating(true);
    try {
      const durationDays = Math.floor(
        (Date.parse(`${requestForm.endDate}T00:00:00Z`) - Date.parse(`${requestForm.startDate}T00:00:00Z`)) / 86_400_000,
      ) + 1;
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Time-Zone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
        body: JSON.stringify({
          message: `Organiza un itinerario de ${durationDays} días para ${requestForm.destination}, priorizando estos intereses: ${interests.join(", ")}. ${requestForm.notes}`.trim(),
          context: {
            origin: requestForm.origin,
            destination: requestForm.destination,
            startDate: requestForm.startDate,
            endDate: requestForm.endDate,
            travelers: requestForm.travelers,
            interests,
            budget: requestForm.budget,
            currency: requestForm.currency,
            travelType: requestForm.travelType,
            pace: requestForm.pace,
            notes: requestForm.notes,
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
        const destination = destinations.find((entry) => entry.name.toLocaleLowerCase("es") === requestForm.destination.toLocaleLowerCase("es"));
        if (destination) {
          const scheduledDays = addDailySchedules(generateItineraryFromTrip(destination, requestForm));
          if (!scheduledDays) throw new Error("Las actividades de demostración no caben en un horario de 09:00 a 21:00.");
          itinerary = {
            destination: destination.name,
            durationDays,
            startDate: requestForm.startDate,
            endDate: requestForm.endDate,
            travelers: requestForm.travelers,
            budget: { total: requestForm.budget, currency: requestForm.currency, status: "provided" },
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
            <p className="mb-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs uppercase tracking-[0.2em]">Tu espacio de viaje</p>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl xl:text-5xl">
              Hola{profile.name.trim() ? `, ${profile.name.trim()}` : ""}. Tus viajes, en un solo lugar.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-emerald-50/90">
              Consulta tus próximos planes, revisa el presupuesto y continúa organizando tu siguiente destino.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="#create-trip" className="rounded-full bg-white px-5 py-3 font-semibold text-emerald-700">Crear itinerario</Link>
              <Link href="/viajes" className="rounded-full border border-white/40 bg-white/10 px-5 py-3 font-semibold">Gestionar mis viajes</Link>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-950/15 p-5 shadow-inner ring-1 ring-white/20">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-50/80">Tu próximo plan</p>
            {upcomingTrips[0] ? (
              <>
                <p className="mt-3 text-2xl font-bold">{upcomingTrips[0].destination}</p>
                <p className="mt-1 text-sm text-emerald-50/90">{upcomingTrips[0].name}</p>
                <p className="mt-4 text-sm">{formatTripPeriod(upcomingTrips[0].startDate, upcomingTrips[0].endDate)}</p>
                <p className="mt-2 text-sm">
                  Presupuesto: {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: upcomingTrips[0].currency,
                  }).format(upcomingTrips[0].budget)}
                </p>
                <Link href={`/viajes#trip-${encodeURIComponent(upcomingTrips[0].id)}`} className="mt-4 inline-block rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
                  Abrir viaje
                </Link>
              </>
            ) : (
              <>
                <p className="mt-3 text-lg font-semibold">{persistenceError ? "No se pudo cargar tu próximo viaje." : "Aún no tienes un próximo viaje."}</p>
                <p className="mt-2 text-sm text-emerald-50/90">
                  {persistenceError ? "Revisa el estado de conexión y vuelve a intentarlo." : "Crea un itinerario para empezar a organizarlo."}
                </p>
              </>
            )}
          </div>
        </section>
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.8fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Agenda personal</p>
                <h2 className="mt-1 text-xl font-bold sm:text-2xl">Próximos viajes</h2>
              </div>
              <Link href="/viajes" className="text-sm font-semibold text-emerald-800 underline underline-offset-4">Ver mis viajes</Link>
            </div>
            {upcomingTrips.length > 0 ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {upcomingTrips.map((trip) => (
                  <li key={trip.id}>
                    <Link href={`/viajes#trip-${encodeURIComponent(trip.id)}`} className="block h-full rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{formatTripPeriod(trip.startDate, trip.endDate)}</span>
                      <span className="mt-2 block text-lg font-semibold text-slate-900">{trip.destination}</span>
                      <span className="mt-1 block truncate text-sm text-slate-600">{trip.name}</span>
                      <span className="mt-3 block text-sm font-medium text-slate-800">
                        {new Intl.NumberFormat("es-ES", { style: "currency", currency: trip.currency }).format(trip.budget)}
                        <span className="ml-1 text-xs font-normal text-slate-500">presupuesto</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : savedTrips.length > 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No hay fechas futuras en el resumen reciente. Consulta todos tus viajes para ver los anteriores.</p>
            ) : persistenceError ? (
              <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No se pudo comprobar si tienes viajes guardados. Revisa el mensaje de error de esta página.</p>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5">
                <p className="font-semibold text-slate-900">Todavía no hay viajes guardados.</p>
                <p className="mt-1 text-sm text-slate-600">Puedes crear un itinerario aquí mismo o pedir una propuesta al asistente.</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                    <Link href="/planificar" className="text-emerald-800 underline underline-offset-4">Crear viaje paso a paso</Link>
                  <Link href="/ia" className="text-emerald-800 underline underline-offset-4">Abrir el asistente IA</Link>
                  <Link href="/destinos" className="text-emerald-800 underline underline-offset-4">Explorar destinos</Link>
                </div>
              </div>
            )}
          </div>
          <aside className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Accesos rápidos</h2>
              <div className="mt-3 grid gap-2 text-sm">
                <Link href="/calendario" className="rounded-xl bg-slate-50 px-3 py-3 font-medium text-slate-800 hover:bg-emerald-50">Abrir calendario</Link>
                <Link href="/presupuesto" className="rounded-xl bg-slate-50 px-3 py-3 font-medium text-slate-800 hover:bg-emerald-50">Revisar presupuestos</Link>
                <Link href="/ia" className="rounded-xl bg-slate-50 px-3 py-3 font-medium text-slate-800 hover:bg-emerald-50">Preguntar al asistente IA</Link>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Presupuesto de próximos viajes</h2>
              {upcomingBudgets.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {upcomingBudgets.map(([currency, total]) => (
                    <li key={currency} className="flex justify-between gap-3">
                      <span className="text-slate-600">{currency}</span>
                      <strong>{new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(total)}</strong>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-slate-600">{persistenceError ? "No se pudieron cargar los presupuestos de viajes." : "No hay presupuestos de próximos viajes en el resumen reciente."}</p>}
              <p className="mt-3 text-xs text-slate-500">Las monedas se muestran por separado; no se realiza conversión.</p>
            </div>
          </aside>
        </section>
        {hasGeneratedItinerary && (
          <Link href="/itinerario" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            Abrir el último itinerario generado
          </Link>
        )}

        <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)] 2xl:gap-8">
          <form id="create-trip" onSubmit={handleSubmit} className="min-w-0 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
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
                <input type="date" min={today} value={effectiveForm.startDate} onChange={(e) => setForm((current) => updateNewTripDates(current, e.target.value, current.endDate, today))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Fecha de regreso
                <input type="date" min={effectiveForm.startDate || today} value={effectiveForm.endDate} onChange={(e) => setForm((current) => updateNewTripDates(current, current.startDate, e.target.value, today))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
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

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Explora tus planes</p>
            <h2 className="mt-1 text-xl font-bold">Mapa de actividades guardadas</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">El mapa usa solo las coordenadas que existan en los itinerarios guardados; no inventa ubicaciones ni rutas.</p>
          </div>
          <Link href="/mapa" className="min-h-11 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Abrir mapa interactivo</Link>
        </section>
      </main>
    </div>
  );
}
