"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InterestPicker } from "@/features/itinerary/components/interest-picker";
import { LocationAutocomplete } from "@/features/trips/components/location-autocomplete";
import { destinations, defaultProfile } from "@/lib/data/demo-data";
import { addDailySchedules } from "@/lib/itinerary-schedule";
import { generateItineraryFromTrip } from "@/lib/itinerary";
import { allTravelInterests, resolveTripInterests } from "@/lib/interest-catalog";
import { saveGeneratedItinerary, saveTripFormDraft } from "@/lib/generated-itinerary";
import { getProfilePreferences, getPlannerDraftScope } from "@/lib/persistence/profile-client";
import { validateTripForm } from "@/lib/validators";
import { localTodayIso, normalizeNewDateRange, normalizeNewTripDates } from "@/lib/trip-dates";
import { useLocalToday } from "@/lib/hooks/use-local-today";
import type { Currency, ProfilePreferences, TripFormValues } from "@/lib/types";
import type { TripDraft } from "@/lib/persistence/types";
import { CURRENCY_OPTIONS, currencyFractionDigits } from "@/lib/currency-catalog";
import { formatMoney } from "@/lib/money";

const emptyForm: TripFormValues = {
  origin: "",
  destination: destinations[0]?.name ?? "",
  startDate: "",
  endDate: "",
  travelers: 1,
  budget: 0,
  currency: defaultProfile.currency,
  interests: [],
  notes: "",
};

export function ManualTripPlanner() {
  const today = useLocalToday();
  const router = useRouter();
  const [form, setForm] = useState<TripFormValues>(emptyForm);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [profile, setProfile] = useState<ProfilePreferences>(defaultProfile);
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getProfilePreferences()
      .then((saved) => {
        if (!active) return;
        setProfile(saved);
        setCustomInterests(saved.interests.filter((interest) => !(allTravelInterests as readonly string[]).includes(interest)));
        setForm((current) => ({
          ...current,
          currency: saved.currency,
          interests: saved.interests.filter((interest) => (allTravelInterests as readonly string[]).includes(interest)),
        }));
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof Error && error.message.includes("Inicia sesión"))) setNotice(
          error instanceof Error
            ? `No se pudieron cargar las preferencias guardadas: ${error.message}`
            : "No se pudieron cargar las preferencias guardadas. Puedes completar el formulario con los valores disponibles.",
        );
      });
    return () => { active = false; };
  }, []);

  const update = <Key extends keyof TripFormValues,>(key: Key, value: TripFormValues[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateDate = (key: "startDate" | "endDate", value: string) => {
    setForm((current) => ({
      ...current,
      ...normalizeNewDateRange(
        key === "startDate" ? value : current.startDate,
        key === "endDate" ? value : current.endDate,
        today,
      ),
    }));
  };

  const prepareItinerary = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors([]);
    setNotice("");
    const interests = resolveTripInterests(form.interests, [], customInterests);
    const requestForm = { ...form, interests };
    const validationErrors = validateTripForm(requestForm);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSaving(true);
    try {
      const destination = destinations.find((item) => item.name === form.destination) ?? {
        name: form.destination,
        places: [],
        ...(form.destinationLocation?.name === form.destination && form.destinationLocation.latitude !== undefined
          && form.destinationLocation.longitude !== undefined
          ? { lat: form.destinationLocation.latitude, lng: form.destinationLocation.longitude }
          : {}),
      };
      const days = addDailySchedules(generateItineraryFromTrip(destination, requestForm));
      if (!days) throw new Error("No se pudo preparar un horario diario válido. Revisa las fechas o reduce la duración.");
      const durationDays = days.length;
      const tripDraft: TripDraft = normalizeNewTripDates({
        name: `${destination.name} · ${requestForm.startDate}`,
        origin: requestForm.origin,
        destination: destination.name,
        startDate: requestForm.startDate,
        endDate: requestForm.endDate,
        travelers: requestForm.travelers,
        budget: requestForm.budget,
        currency: requestForm.currency,
        interests: requestForm.interests,
        travelType: requestForm.travelType,
        status: "borrador",
        itinerary: days,
      }, localTodayIso());
      const scope = await getPlannerDraftScope();
      const normalizedForm = {
        ...requestForm,
        startDate: tripDraft.startDate ?? requestForm.startDate,
        endDate: tripDraft.endDate ?? requestForm.endDate,
      };
      saveTripFormDraft(normalizedForm, scope);
      saveGeneratedItinerary({
        form: normalizedForm,
        itinerary: {
          destination: destination.name,
          durationDays,
          startDate: tripDraft.startDate ?? form.startDate,
          endDate: tripDraft.endDate ?? form.endDate,
          travelers: form.travelers,
          budget: { total: form.budget, currency: form.currency, status: "provided" },
          days: tripDraft.itinerary,
        },
        source: "demo",
        generatedAt: new Date().toISOString(),
      }, scope);
      router.push("/itinerario");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo preparar el itinerario.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="manual-trip-planner rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8" aria-labelledby="manual-planner-title">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">Creación de viaje</p>
          <h2 id="manual-planner-title" className="mt-1 text-2xl font-bold sm:text-3xl">Planifica paso a paso</h2>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600">
            Completa el viaje y revisa la propuesta local antes de guardarla. Los lugares y precios del catálogo son orientativos, no horarios ni tarifas oficiales.
          </p>
        </div>
        <Link href="/ia" className="min-h-11 rounded-full border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-800">Usar el asistente IA</Link>
      </div>
      <div className="mb-5 flex flex-wrap gap-2 text-sm" aria-label="Pasos del planificador">
        <span className={`rounded-full px-4 py-2 font-semibold ${step === 1 ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"}`}>1. Datos básicos</span>
        <span className={`rounded-full px-4 py-2 font-semibold ${step === 2 ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"}`}>2. Preferencias y revisión</span>
      </div>
      <form onSubmit={(event) => void prepareItinerary(event)} className="space-y-6">
        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <LocationAutocomplete
              label="Origen"
              value={form.origin}
              required
              onChange={(origin) => setForm((current) => ({ ...current, origin, originLocation: undefined }))}
              onSelectionChange={(originLocation) => setForm((current) => ({ ...current, originLocation }))}
            />
            <LocationAutocomplete
              label="Destino"
              value={form.destination}
              required
              onChange={(destination) => setForm((current) => ({ ...current, destination, destinationLocation: undefined }))}
              onSelectionChange={(destinationLocation) => setForm((current) => ({ ...current, destinationLocation }))}
            />
            <label className="text-sm font-medium text-slate-700">Fecha de salida
              <input type="date" required min={today} value={form.startDate} onChange={(event) => updateDate("startDate", event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-medium text-slate-700">Fecha de regreso
              <input type="date" required min={form.startDate || today} value={form.endDate} onChange={(event) => updateDate("endDate", event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-medium text-slate-700">Viajeros
              <input type="number" min={1} max={100} required value={form.travelers} onChange={(event) => update("travelers", Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
            </label>
            <p className="self-center text-sm text-slate-600">Las fechas corresponden a los días del viaje; no se asignan horas reales de vuelos o trenes.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="text-sm font-medium text-slate-700">Presupuesto para actividades
                <input type="number" min={0} step={10 ** -currencyFractionDigits(form.currency)} required value={form.budget} onChange={(event) => update("budget", Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
              </label>
              <label className="text-sm font-medium text-slate-700">Moneda
                <select value={form.currency} onChange={(event) => update("currency", event.target.value as Currency)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3">
                  {CURRENCY_OPTIONS.map(({ code, name }) => <option key={code} value={code}>{code} — {name}</option>)}
                </select>
              </label>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Intereses para este viaje</p>
              <p className="mb-3 text-sm text-slate-600">Las preferencias de perfil se proponen al abrir el formulario y puedes cambiarlas para este viaje.</p>
              <InterestPicker
                selected={form.interests}
                customInterests={customInterests}
                onSelectedChange={(interests) => update("interests", interests)}
                onCustomInterestsChange={setCustomInterests}
              />
            </div>
            <label className="block text-sm font-medium text-slate-700">Notas
              <textarea value={form.notes} maxLength={1000} rows={3} onChange={(event) => update("notes", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <div className="rounded-2xl bg-slate-50 p-4">
              <h3 className="font-semibold">Revisión antes de preparar</h3>
              <p className="mt-2 text-sm text-slate-700">{form.origin || "Origen pendiente"} → {form.destination} · {form.startDate || "Salida pendiente"} – {form.endDate || "regreso pendiente"} · {form.travelers} viajeros</p>
              <p className="mt-1 text-sm text-slate-700">{formatMoney(form.budget, form.currency)} para actividades · {customInterests.length + form.interests.length} intereses</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">La propuesta se prepara localmente con los datos disponibles. Se marcará como modo demo y podrás revisar/editar el itinerario antes de guardarlo.</p>
              {profile.name && <p className="mt-1 text-xs text-slate-500">Preferencias cargadas para {profile.name}.</p>}
            </div>
          </div>
        )}
        {errors.length > 0 && <ul className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
        {notice && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">{notice}</p>}
        <div className="flex flex-wrap justify-between gap-3">
          {step === 2 ? (
            <button type="button" onClick={() => setStep(1)} className="min-h-11 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold">Volver a datos básicos</button>
          ) : <span />}
          {step === 1 ? (
            <button type="button" onClick={() => setStep(2)} className="min-h-11 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Continuar con preferencias</button>
          ) : (
            <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Preparando propuesta…" : "Preparar itinerario para revisar"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
