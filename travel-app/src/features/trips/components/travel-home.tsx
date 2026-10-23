"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { InterestPicker } from "@/features/itinerary/components/interest-picker";
import { LocationAutocomplete } from "@/features/trips/components/location-autocomplete";
import { defaultProfile, destinations } from "@/lib/data/demo-data";
import { generateItineraryFromTrip } from "@/lib/itinerary";
import { addDailySchedules } from "@/lib/itinerary-schedule";
import { validateTripForm } from "@/lib/validators";
import { getPlannerDraftScope, getProfilePreferences } from "@/lib/persistence/profile-client";
import { listTripSummaries, persistenceLabel } from "@/lib/persistence/client";
import { allTravelInterests, resolveTripInterests } from "@/lib/interest-catalog";
import { loadTripFormDraft, saveGeneratedItinerary, saveTripFormDraft } from "@/lib/generated-itinerary";
import { formatTripPeriod } from "@/lib/date-format";
import { localTodayIso, normalizeNewDateRange } from "@/lib/trip-dates";
import { useLocalToday } from "@/lib/hooks/use-local-today";
import { CURRENCY_OPTIONS, currencyFractionDigits } from "@/lib/currency-catalog";
import { formatMoney } from "@/lib/money";
import type { SavedTripSummary } from "@/lib/persistence/types";
import type { ProfilePreferences, TripFormValues } from "@/lib/types";

const defaultForm: TripFormValues = {
  origin: "Madrid",
  destination: "Marrakech",
  startDate: "2026-04-12",
  endDate: "2026-04-16",
  travelers: 2,
  budget: 800,
  currency: "EUR",
  interests: [],
  notes: "",
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
  const selectedDestination = destinations[0];
  const [savedTrips, setSavedTrips] = useState<SavedTripSummary[]>([]);
  const [persistenceError, setPersistenceError] = useState("");
  const [profile, setProfile] = useState<ProfilePreferences>(defaultProfile);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");

  useEffect(() => {
    let active = true;
    void getPlannerDraftScope()
      .then(async (scope) => {
        if (!active) return;
        setDraftScope(scope);
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
          listTripSummaries(),
        ]);
        if (!active) return;
        setSavedTrips(tripData);
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
            ...(!hasSavedFormRef.current ? { currency: savedProfile.currency } : {}),
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

  const upcomingTrips = useMemo(() => {
    return savedTrips
      .filter((trip) => trip.startDate && (!trip.endDate || trip.endDate >= today))
      .sort((left, right) => (left.startDate ?? "").localeCompare(right.startDate ?? ""));
  }, [savedTrips, today]);
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
        ? data.itinerary as import("@/lib/ai").ItineraryPlan
        : undefined;
      const source = data.source === "openrouter" ? "openrouter" : "demo";
      if (!itinerary && source === "demo") {
        const localDestination = destinations.find((entry) => entry.name.toLocaleLowerCase("es") === requestForm.destination.toLocaleLowerCase("es"));
        const destination = localDestination ?? {
          name: requestForm.destination,
          places: [],
          ...(requestForm.destinationLocation?.name === requestForm.destination && requestForm.destinationLocation.latitude !== undefined
            && requestForm.destinationLocation.longitude !== undefined
            ? { lat: requestForm.destinationLocation.latitude, lng: requestForm.destinationLocation.longitude }
            : {}),
        };
        const scheduledDays = addDailySchedules(generateItineraryFromTrip(destination, requestForm));
        if (!scheduledDays) throw new Error("Las actividades de demostración no caben dentro del mismo día.");
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
      router.push("/itinerario");
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "No se pudo generar el itinerario. Vuelve a intentarlo.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="home-dashboard">
      <main className="home-main mx-auto flex w-full max-w-screen-2xl flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-8 lg:px-8 2xl:px-10">
        <section className="home-hero grid min-w-0 gap-6 rounded-3xl p-5 text-white shadow-xl sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:gap-8" style={{ backgroundImage: `linear-gradient(90deg, rgba(9,35,36,.94) 0%, rgba(9,35,36,.74) 56%, rgba(9,35,36,.28) 100%), url(${selectedDestination.image})` }}>
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs uppercase tracking-[0.2em]"><span aria-hidden="true">✦</span> Tu espacio de viaje</p>
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
          <div className="next-trip-card rounded-2xl bg-slate-950/15 p-5 shadow-inner ring-1 ring-white/20">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-50/80">Tu próximo plan</p>
            {upcomingTrips[0] ? (
              <>
                <p className="mt-3 text-2xl font-bold">{upcomingTrips[0].destination}</p>
                <p className="mt-1 text-sm text-emerald-50/90">{upcomingTrips[0].name}</p>
                <p className="mt-4 text-sm">{formatTripPeriod(upcomingTrips[0].startDate, upcomingTrips[0].endDate)}</p>
                <p className="mt-2 text-sm">Presupuesto: {formatMoney(upcomingTrips[0].budget, upcomingTrips[0].currency)}</p>
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
        <section className="min-w-0">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Agenda personal</p>
                <h2 className="mt-1 text-xl font-bold sm:text-2xl">Próximos viajes</h2>
              </div>
              <Link href="/viajes" className="text-sm font-semibold text-emerald-800 underline underline-offset-4">Ver mis viajes</Link>
            </div>
            {upcomingTrips.length > 0 ? (
              <>
                <ul className="mt-2 divide-y divide-slate-100">
                  {upcomingTrips.slice(0, 3).map((trip) => (
                    <li key={trip.id}>
                      <Link href={`/viajes#trip-${encodeURIComponent(trip.id)}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl px-2 py-3 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{trip.destination}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-600">{trip.name} · {formatTripPeriod(trip.startDate, trip.endDate)}</span>
                        </span>
                        <span className="shrink-0 text-right text-sm font-semibold text-slate-800">
                          {formatMoney(trip.budget, trip.currency)}
                          <span className="block text-[0.7rem] font-normal text-slate-500">presupuesto</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {upcomingTrips.length > 3 && <p className="mt-2 px-2 text-xs text-slate-500">Mostrando 3 de {upcomingTrips.length} próximos viajes. Puedes consultar la lista completa en Mis viajes.</p>}
              </>
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
        </section>
        <section className="min-w-0">
          <form id="create-trip" onSubmit={handleSubmit} className="min-w-0 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-semibold sm:text-2xl">Formulario rápido</h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">{persistenceLabel()}</span>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:gap-x-5 xl:gap-y-4">
              <LocationAutocomplete
                label="Origen"
                value={form.origin}
                onChange={(origin) => setForm((current) => ({ ...current, origin, originLocation: undefined }))}
                onSelectionChange={(originLocation) => setForm((current) => ({ ...current, originLocation }))}
              />
              <LocationAutocomplete
                label="Destino"
                value={form.destination}
                onChange={(destination) => setForm((current) => ({ ...current, destination, destinationLocation: undefined }))}
                onSelectionChange={(destinationLocation) => setForm((current) => ({ ...current, destinationLocation }))}
              />
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
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <label className="text-sm font-medium text-slate-700">
                  Presupuesto para actividades y visitas
                  <input type="number" min={1} step={10 ** -currencyFractionDigits(form.currency)} value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) || 1 })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Moneda
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as TripFormValues["currency"] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">
                    {CURRENCY_OPTIONS.map(({ code, name }) => <option key={code} value={code}>{code} — {name}</option>)}
                  </select>
                </label>
              </div>
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
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ej.: Me interesa la historia local, probar la gastronomía típica y recorrer los barrios a pie." maxLength={1000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </label>
            <p className="mt-2 text-xs text-slate-500">El presupuesto cubre solo visitas y actividades turísticas. No incluye transporte, alojamiento, compras personales ni comidas.</p>

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

        </section>
        {persistenceError && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
            {persistenceError} {persistenceError.includes("Inicia sesión") && <Link className="font-semibold underline" href="/cuenta">Iniciar sesión</Link>}
          </p>
        )}

      </main>
    </div>
  );
}
