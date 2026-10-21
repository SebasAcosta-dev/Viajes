"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { addExpense, deleteExpense, deleteTrip, listTrips, persistenceLabel, reorderActivities, replaceTripDay, saveTrip, updateActivity, updateExpense, updateTrip } from "@/lib/persistence/client";
import { calculateScheduledEnd, getBlockTypeLabel } from "@/lib/itinerary-schedule";
import { addIsoDays, formatIsoDate } from "@/lib/date-format";
import { getTripBudgetSummary } from "@/lib/itinerary";
import { TripCalendar } from "@/features/calendar/components/trip-calendar";
import type { SavedExpense, SavedTrip } from "@/lib/persistence/types";
import type { Currency, ItineraryDay, TripStatus } from "@/lib/types";
import { useLocalToday } from "@/lib/hooks/use-local-today";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";

type View = "trips" | "budget";
type TripEditDraft = {
  name: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: string;
  budget: string;
  currency: Currency;
  status: TripStatus;
};
type TripFilter = "all" | "future" | "active" | "completed" | "drafts";
type TripSort = "startDate" | "destination" | "status" | "budget";

function money(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
}

function priceStatusLabel(status: SavedTrip["itinerary"][number]["items"][number]["priceStatus"]): string {
  if (status === "verified") return "Precio verificado";
  if (status === "free_verified") return "Gratuito verificado";
  if (status === "estimate") return "Estimación";
  return "Precio no disponible";
}

function dayDateLabel(day: SavedTrip["itinerary"][number], startDate: string | null): string {
  const date = day.date ?? (startDate ? addIsoDays(startDate, day.dayNumber - 1) : undefined);
  return date ? ` · ${formatIsoDate(date)}` : "";
}

function tripDateMinimum(
  trip: SavedTrip,
  draft: TripEditDraft | undefined,
  key: "startDate" | "endDate",
  today: string,
): string {
  const currentDate = key === "startDate" ? trip.startDate : trip.endDate;
  const draftDate = key === "startDate" ? draft?.startDate : draft?.endDate;
  if (currentDate && currentDate < today && draftDate === currentDate) return currentDate;
  if (key === "startDate") return today;
  const draftStart = draft?.startDate ?? "";
  return draftStart > today ? draftStart : today;
}

function ActivityForm({
  trip,
  activity,
  onSaved,
  onError,
}: {
  trip: SavedTrip;
  activity: SavedTrip["itinerary"][number]["items"][number];
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description);
  const [durationMinutes, setDurationMinutes] = useState(activity.durationMinutes);
  const [startTime, setStartTime] = useState(activity.startTime ?? "");
  const [latitude, setLatitude] = useState(activity.lat?.toString() ?? "");
  const [longitude, setLongitude] = useState(activity.lng?.toString() ?? "");
  const [pricePerPerson, setPricePerPerson] = useState(
    activity.pricePerPerson?.toString() ??
    (activity.estimate && trip.travelers ? (activity.estimate / trip.travelers).toFixed(2) : ""),
  );
  const [priceStatus, setPriceStatus] = useState<NonNullable<typeof activity.priceStatus>>(activity.priceStatus ?? "unknown");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const scheduledStart = startTime || activity.startTime;
      const endTime = scheduledStart ? calculateScheduledEnd(scheduledStart, durationMinutes) : undefined;
      if (scheduledStart && !endTime) {
        throw new Error("La duración no cabe en el horario diario de 09:00 a 21:00.");
      }
      if (Boolean(latitude.trim()) !== Boolean(longitude.trim())) {
        throw new Error("Indica ambas coordenadas para guardar la ubicación.");
      }
      const coordinates = latitude.trim() && longitude.trim()
        ? { lat: Number(latitude), lng: Number(longitude) }
        : undefined;
      if (coordinates && (!Number.isFinite(coordinates.lat) || coordinates.lat < -90 || coordinates.lat > 90
        || !Number.isFinite(coordinates.lng) || coordinates.lng < -180 || coordinates.lng > 180)) {
        throw new Error("La latitud debe estar entre -90 y 90 y la longitud entre -180 y 180.");
      }
      if ((priceStatus === "estimate" || priceStatus === "verified")
        && (!pricePerPerson.trim() || !Number.isFinite(Number(pricePerPerson)) || Number(pricePerPerson) <= 0)) {
        throw new Error("Indica un precio positivo por persona o selecciona precio no disponible o gratuito verificado.");
      }
      await updateActivity(trip.id, {
        ...activity,
        name,
        description,
        durationMinutes,
        ...(startTime ? { startTime, endTime } : {}),
        ...(coordinates ?? {}),
        ...(priceStatus === "free_verified"
          ? { pricePerPerson: undefined, estimate: 0, priceStatus }
          : priceStatus === "unknown"
            ? { pricePerPerson: undefined, estimate: undefined, priceStatus }
            : {
                pricePerPerson: Number(pricePerPerson),
                estimate: Number((Number(pricePerPerson) * trip.travelers).toFixed(2)),
                priceStatus,
              }),
      });
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo modificar la actividad.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
      {activity.startTime && activity.endTime && (
        <p className="text-xs text-slate-600 sm:col-span-2">
          Horario del bloque: <span className="font-semibold tabular-nums">{activity.startTime}–{activity.endTime}</span>
        </p>
      )}
      <label className="text-xs text-slate-600">Actividad
        <input value={name} required maxLength={200} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Duración (minutos)
        <input type="number" min={1} max={1440} required value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Hora de inicio
        <input type="time" min="09:00" max="20:59" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      {startTime && <p className="self-end text-xs text-slate-600">Final estimado: {calculateScheduledEnd(startTime, durationMinutes) ?? "fuera del horario 09:00–21:00"}</p>}
      <label className="text-xs text-slate-600">Latitud (opcional)
        <input type="number" min={-90} max={90} step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Longitud (opcional)
        <input type="number" min={-180} max={180} step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600 sm:col-span-2">Descripción
        <input value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Estado del precio
        <select value={priceStatus} onChange={(event) => setPriceStatus(event.target.value as NonNullable<typeof activity.priceStatus>)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="verified">Verificado</option><option value="estimate">Estimado</option><option value="unknown">No disponible</option><option value="free_verified">Gratuito verificado</option>
        </select>
      </label>
      <label className="text-xs text-slate-600">Precio por persona ({activity.currency})
        <input type="number" min={0.01} step="0.01" disabled={priceStatus === "unknown" || priceStatus === "free_verified"} value={pricePerPerson} onChange={(event) => setPricePerPerson(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" />
      </label>
      <p className="self-end text-xs text-slate-500">{priceStatus === "free_verified" ? "Gratuito verificado (0)" : priceStatus === "unknown" ? "Precio no disponible" : pricePerPerson ? `Total para ${trip.travelers}: ${money(Number(pricePerPerson) * trip.travelers, activity.currency)}` : "Indica un precio positivo para este estado."}</p>
      <button disabled={saving} className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
        {saving ? "Guardando..." : "Guardar actividad"}
      </button>
    </form>
  );
}

function ExpenseForm({ trip, onSaved, onError }: { trip: SavedTrip; onSaved: () => void; onError: (message: string) => void }) {
  const [category, setCategory] = useState("Actividades y entradas");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<Currency>(trip.currency);
  const [notes, setNotes] = useState("");
  const [activityId, setActivityId] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await addExpense(trip.id, {
        category, description, amount: Number(amount), currency, incurredOn, notes,
        ...(activityId ? { activityId } : {}),
      });
      setDescription("");
      setAmount("");
      setNotes("");
      setActivityId("");
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo registrar el gasto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 rounded-xl bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs text-slate-600">Categoría
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {["Actividades y entradas", "Gastronomía", "Transporte", "Alojamiento", "Otros"].map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600">Concepto
        <input value={description} maxLength={240} required onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Importe
        <input type="number" min={0} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Moneda
        <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {(["EUR", "USD", "GBP", "MAD"] as const).map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600">Fecha
        <input type="date" required value={incurredOn} onChange={(event) => setIncurredOn(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Actividad relacionada (opcional)
        <select value={activityId} onChange={(event) => setActivityId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Sin vincular</option>
          {trip.itinerary.flatMap((day) => day.items).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600 sm:col-span-2">Notas
        <textarea value={notes} maxLength={1000} rows={2} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <button disabled={saving} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {saving ? "Guardando…" : "Añadir gasto"}
      </button>
    </form>
  );
}

function ExpenseEditor({ trip, expense, onSaved, onError }: {
  trip: SavedTrip;
  expense: SavedExpense;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(expense.category);
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(String(expense.amount));
  const [currency, setCurrency] = useState<Currency>(expense.currency);
  const [incurredOn, setIncurredOn] = useState(expense.incurredOn);
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [activityId, setActivityId] = useState(expense.activityId ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateExpense(trip.id, expense.id, {
        category, description, amount: Number(amount), currency, incurredOn, notes,
        ...(activityId ? { activityId } : {}),
      });
      setEditing(false);
      onSaved();
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "No se pudo modificar el gasto.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar el gasto «${expense.description}»? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteExpense(trip.id, expense.id);
      onSaved();
    } catch (deleteError) {
      onError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el gasto.");
    }
  };

  return (
    <li className="rounded-xl border border-amber-100 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{formatIsoDate(expense.incurredOn)} · {expense.category}: {expense.description}</span>
        <span className="flex flex-wrap items-center gap-2">
          <strong>{money(expense.amount, expense.currency)}</strong>
          <button type="button" onClick={() => setEditing((value) => !value)} className="min-h-10 rounded-lg border px-3 text-sm font-medium">{editing ? "Cancelar" : "Editar"}</button>
          <button type="button" onClick={() => void remove()} className="min-h-10 rounded-lg border border-red-200 px-3 text-sm text-red-700">Eliminar</button>
        </span>
      </div>
      {expense.notes && <p className="mt-2 text-sm text-slate-600">{expense.notes}</p>}
      {editing && (
        <form onSubmit={(event) => void submit(event)} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs text-slate-600">Concepto
            <input value={description} maxLength={240} required onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" />
          </label>
          <label className="text-xs text-slate-600">Categoría
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3 text-sm">
              {[...new Set(["Actividades y entradas", "Gastronomía", "Transporte", "Alojamiento", "Otros", category])].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">Importe
            <input type="number" min={0} step="0.01" value={amount} required onChange={(event) => setAmount(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" />
          </label>
          <label className="text-xs text-slate-600">Moneda
            <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} className="mt-1 min-h-11 w-full rounded-lg border px-3 text-sm">
              {(["EUR", "USD", "GBP", "MAD"] as const).map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">Fecha
            <input type="date" value={incurredOn} required onChange={(event) => setIncurredOn(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3 text-sm" />
          </label>
          <label className="text-xs text-slate-600">Actividad relacionada
            <select value={activityId} onChange={(event) => setActivityId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3 text-sm">
              <option value="">Sin vincular</option>
              {trip.itinerary.flatMap((day) => day.items).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2 xl:col-span-3">Notas
            <textarea value={notes} maxLength={1000} rows={2} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <button disabled={saving} className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      )}
    </li>
  );
}

function RegenerateDayControl({ trip, day, onSaved, onError }: {
  trip: SavedTrip;
  day: ItineraryDay;
  onSaved: (source: "openrouter" | "demo") => void;
  onError: (message: string) => void;
}) {
  const [preview, setPreview] = useState<ItineraryDay | null>(null);
  const [source, setSource] = useState<"openrouter" | "demo" | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const date = day.date ?? (trip.startDate ? addIsoDays(trip.startDate, day.dayNumber - 1) : undefined);

  const generate = async () => {
    setLoading(true);
    onError("");
    setPreview(null);
    setSource(null);
    try {
      const context = {
        destination: trip.destination,
        origin: trip.origin,
        travelers: trip.travelers,
        interests: trip.interests,
        budget: trip.budget,
        currency: trip.currency,
        travelType: trip.travelType,
        ...(date ? { startDate: date, endDate: date } : {}),
      };
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Reorganiza exclusivamente el día ${day.dayNumber} de ${trip.destination}. Conserva el horario normal de 09:00 a 21:00, los intereses, el presupuesto de actividades y el ritmo equilibrado. No generes ni modifiques otras jornadas. Jornada actual: ${day.theme}.`,
          context,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("itinerary" in result)
        || typeof result.itinerary !== "object" || result.itinerary === null || !("days" in result.itinerary)
        || !Array.isArray(result.itinerary.days) || result.itinerary.days.length !== 1
        || !("source" in result) || (result.source !== "openrouter" && result.source !== "demo")) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "El asistente no devolvió exactamente una jornada completa; no se ha cambiado el itinerario.";
        throw new Error(message);
      }
      const candidate = result.itinerary.days[0] as ItineraryDay;
      const originalByName = new Map(day.items.map((item) => [item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), item]));
      const mergedItems = candidate.items.map((item, index) => {
        const original = originalByName.get(item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
        const retainPrice = original && original.currency === item.currency
          && original.priceStatus !== "unknown"
          && (item.priceStatus === "unknown" || original.priceStatus === "verified" || original.priceStatus === "free_verified");
        return {
          ...item,
          order: index + 1,
          ...(original ? {
            ...(item.lat === undefined && original.lat !== undefined ? { lat: original.lat } : {}),
            ...(item.lng === undefined && original.lng !== undefined ? { lng: original.lng } : {}),
          } : {}),
          ...(retainPrice && original ? {
            pricePerPerson: original.pricePerPerson,
            estimate: original.estimate,
            priceStatus: original.priceStatus,
            priceSource: original.priceSource,
            priceCheckedAt: original.priceCheckedAt,
            budgetCategory: original.budgetCategory,
          } : {}),
        };
      });
      setPreview({
        ...candidate,
        id: day.id,
        dayNumber: day.dayNumber,
        ...(date ? { date } : { date: undefined }),
        items: mergedItems,
      });
      setSource(result.source);
    } catch (generationError) {
      onError(generationError instanceof Error ? generationError.message : "No se pudo preparar la nueva jornada.");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setSaving(true);
    onError("");
    try {
      await replaceTripDay(trip.id, day.dayNumber, preview);
      setPreview(null);
      if (source) onSaved(source);
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "No se pudo sustituir la jornada.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <button type="button" disabled={loading || saving} onClick={() => void generate()} className="min-h-11 rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {loading ? "Preparando propuesta…" : "Regenerar esta jornada"}
      </button>
      {preview && (
        <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3">
          <p className="font-semibold">Vista previa · origen: {source === "openrouter" ? "OpenRouter" : "modo demo"}</p>
          <p className="text-sm text-slate-600">{preview.theme} · {date ? formatIsoDate(date) : "Fecha no disponible"} · horario 09:00–21:00</p>
          <ol className="mt-2 space-y-1 text-sm">
            {preview.items.map((item) => <li key={item.id}>{item.startTime && item.endTime ? `${item.startTime}–${item.endTime} · ` : ""}{item.name} · {item.durationMinutes} min</li>)}
          </ol>
          <p className="mt-2 text-xs text-amber-800">Solo se reemplazará esta jornada después de confirmar. Los días restantes y los gastos guardados no se sustituyen.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={() => void confirm()} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Confirmar cambio de esta jornada"}
            </button>
            <button type="button" disabled={saving} onClick={() => setPreview(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TripsManager({ view }: { view: View }) {
  const today = useLocalToday();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [currencyDrafts, setCurrencyDrafts] = useState<Record<string, Currency>>({});
  const [tripDrafts, setTripDrafts] = useState<Record<string, TripEditDraft>>({});
  const [viewMode, setViewMode] = useState<"cards" | "list" | "calendar">("cards");
  const [searchQuery, setSearchQuery] = useState("");
  const [tripFilter, setTripFilter] = useState<TripFilter>("all");
  const [tripSort, setTripSort] = useState<TripSort>("startDate");
  const [budgetTripId, setBudgetTripId] = useState("");
  const [budgetTab, setBudgetTab] = useState<"activities" | "expenses">("activities");

  const refresh = useCallback(async (): Promise<boolean> => {
    setError("");
    try {
      await getPlannerDraftScope();
      const result = await listTrips();
      setTrips(result);
      setBudgetDrafts(Object.fromEntries(result.map((trip) => [trip.id, String(trip.budget)])));
      setCurrencyDrafts(Object.fromEntries(result.map((trip) => [trip.id, trip.currency])));
      setTripDrafts(Object.fromEntries(result.map((trip) => [trip.id, {
        name: trip.name,
        origin: trip.origin,
        destination: trip.destination,
        startDate: trip.startDate ?? "",
        endDate: trip.endDate ?? "",
        travelers: String(trip.travelers),
        budget: String(trip.budget),
        currency: trip.currency,
        status: trip.status,
      }])));
      return true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los viajes.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const afterSuccess = async (label: string) => {
    setNotice("");
    if (await refresh()) setNotice(`${label} guardado correctamente en ${persistenceLabel()}.`);
  };

  const removeTrip = async (trip: SavedTrip) => {
    if (!window.confirm(`¿Eliminar el viaje «${trip.name}» y sus actividades y gastos? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteTrip(trip.id);
      await afterSuccess("Viaje eliminado");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el viaje.");
    }
  };

  const saveBudget = async (event: FormEvent<HTMLFormElement>, trip: SavedTrip) => {
    event.preventDefault();
    try {
      await updateTrip(trip.id, { budget: Number(budgetDrafts[trip.id]), currency: currencyDrafts[trip.id] });
      await afterSuccess("Presupuesto");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo actualizar el presupuesto.");
    }
  };

  const saveTripDetails = async (event: FormEvent<HTMLFormElement>, trip: SavedTrip) => {
    event.preventDefault();
    const draft = tripDrafts[trip.id];
    if (!draft) return;
    const changes = {
      ...(draft.name !== trip.name ? { name: draft.name.trim() } : {}),
      ...(draft.origin !== trip.origin ? { origin: draft.origin.trim() } : {}),
      ...(draft.destination !== trip.destination ? { destination: draft.destination.trim() } : {}),
      ...(draft.startDate !== (trip.startDate ?? "") ? { startDate: draft.startDate || null } : {}),
      ...(draft.endDate !== (trip.endDate ?? "") ? { endDate: draft.endDate || null } : {}),
      ...(Number(draft.travelers) !== trip.travelers ? { travelers: Number(draft.travelers) } : {}),
      ...(Number(draft.budget) !== trip.budget ? { budget: Number(draft.budget) } : {}),
      ...(draft.currency !== trip.currency ? { currency: draft.currency } : {}),
      ...(draft.status !== trip.status ? { status: draft.status } : {}),
    };
    if (Object.keys(changes).length === 0) return;
    try {
      await updateTrip(trip.id, changes);
      await afterSuccess("Viaje");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo actualizar el viaje.");
    }
  };

  const updateTripDateDraft = (trip: SavedTrip, key: "startDate" | "endDate", value: string) => {
    const current = tripDrafts[trip.id] ?? {
      name: trip.name,
      origin: trip.origin,
      destination: trip.destination,
      startDate: trip.startDate ?? "",
      endDate: trip.endDate ?? "",
      travelers: String(trip.travelers),
      budget: String(trip.budget),
      currency: trip.currency,
      status: trip.status,
    };
    const nextValue = value && value < today ? today : value;
    const startDate = key === "startDate" ? nextValue : current.startDate;
    const endDate = key === "endDate" ? nextValue : current.endDate;
    setTripDrafts((drafts) => ({
      ...drafts,
      [trip.id]: {
        ...current,
        startDate,
        endDate: startDate && endDate && endDate < startDate ? startDate : endDate,
      },
    }));
  };

  const duplicateTrip = async (trip: SavedTrip) => {
    const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await saveTrip({
        name: `${trip.name.slice(0, 151)} (copia)`,
        origin: trip.origin,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        travelers: trip.travelers,
        budget: trip.budget,
        currency: trip.currency,
        interests: trip.interests,
        travelType: trip.travelType,
        status: "borrador",
        itinerary: trip.itinerary.map((day) => ({
          ...day,
          id: createId(),
          items: day.items.map((activity) => ({ ...activity, id: createId() })),
        })),
      });
      await afterSuccess("Copia del viaje");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "No se pudo duplicar el viaje.");
    }
  };

  const moveActivity = async (trip: SavedTrip, day: SavedTrip["itinerary"][number], index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= day.items.length) return;
    const activityIds = day.items.map((activity) => activity.id);
    [activityIds[index], activityIds[targetIndex]] = [activityIds[targetIndex], activityIds[index]];
    try {
      await reorderActivities(trip.id, day.id, activityIds);
      await afterSuccess("Orden de actividades");
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : "No se pudo reordenar la jornada.");
    }
  };

  const filteredTrips = useMemo(() => {
    const filtered = trips.filter((trip) => {
      const query = searchQuery.trim().toLocaleLowerCase("es");
      if (query && !`${trip.name} ${trip.destination}`.toLocaleLowerCase("es").includes(query)) return false;
      if (view === "budget" && budgetTripId !== "all") return trip.id === budgetTripId;
      if (view === "budget") return true;
      if (tripFilter === "drafts") return trip.status === "borrador";
      if (tripFilter === "completed") return trip.status === "completado" || Boolean(trip.endDate && trip.endDate < today);
      if (tripFilter === "active") return trip.status === "activo" || Boolean(trip.startDate && trip.endDate && trip.startDate <= today && trip.endDate >= today);
      if (tripFilter === "future") return trip.status !== "borrador" && trip.status !== "completado" && Boolean(!trip.startDate || trip.startDate > today);
      return true;
    });
    return filtered.sort((left, right) => {
      if (tripSort === "destination") return left.destination.localeCompare(right.destination, "es");
      if (tripSort === "status") return left.status.localeCompare(right.status, "es");
      if (tripSort === "budget") return right.budget - left.budget;
      return (left.startDate ?? "9999-99-99").localeCompare(right.startDate ?? "9999-99-99");
    });
  }, [budgetTripId, searchQuery, today, tripFilter, tripSort, trips, view]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Almacenamiento: {persistenceLabel()}</p>
        {view === "trips" && <Link href="/ia" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Generar itinerario</Link>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {view === "trips" ? (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Forma de ver los viajes">
              <button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${viewMode === "cards" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Tarjetas</button>
              <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${viewMode === "list" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Lista</button>
              <button type="button" aria-pressed={viewMode === "calendar"} onClick={() => setViewMode("calendar")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${viewMode === "calendar" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Calendario</button>
            </div>
            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">Buscar por nombre o destino
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Ej. Marrakech" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3" />
              </label>
              <label className="text-sm font-medium text-slate-700">Filtrar viajes
                <select value={tripFilter} onChange={(event) => setTripFilter(event.target.value as TripFilter)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3">
                  <option value="all">Todos</option><option value="future">Futuros</option><option value="active">En curso</option><option value="completed">Completados</option><option value="drafts">Borradores</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Ordenar por
                <select value={tripSort} onChange={(event) => setTripSort(event.target.value as TripSort)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3">
                  <option value="startDate">Fecha de inicio</option><option value="destination">Destino</option><option value="status">Estado</option><option value="budget">Presupuesto</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <label className="w-full max-w-xl text-sm font-medium text-slate-700">Seleccionar viaje para el presupuesto
            <select value={budgetTripId} onChange={(event) => setBudgetTripId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3">
              <option value="">Selecciona un viaje</option>
              <option value="all">Resumen de todos los viajes (por moneda, sin conversión)</option>
              {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name} · {trip.destination}</option>)}
            </select>
          </label>
        )}
      </div>
      {view === "budget" && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Datos del presupuesto">
          <button type="button" aria-pressed={budgetTab === "activities"} onClick={() => setBudgetTab("activities")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${budgetTab === "activities" ? "bg-emerald-700 text-white" : "border border-slate-300"}`}>Actividades del viaje</button>
          <button type="button" aria-pressed={budgetTab === "expenses"} onClick={() => setBudgetTab("expenses")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${budgetTab === "expenses" ? "bg-emerald-700 text-white" : "border border-slate-300"}`}>Gastos registrados</button>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p>{error}</p>
          {error.includes("Inicia sesión") && <Link className="mt-2 inline-block font-semibold underline" href="/cuenta">Ir a la cuenta</Link>}
        </div>
      )}
      {notice && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {loading && <p className="text-sm text-slate-600">Cargando viajes...</p>}
      {!loading && view === "trips" && viewMode === "calendar" && <TripCalendar trips={trips} embedded hasError={Boolean(error)} />}
      {!loading && trips.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium">Todavía no hay viajes guardados.</p>
          <Link href="/ia" className="mt-3 inline-block text-sm font-semibold text-emerald-700">Genera un itinerario</Link>
        </div>
      )}
      {!loading && trips.length > 0 && filteredTrips.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-600">
          {view === "budget" && !budgetTripId ? "Selecciona un viaje para consultar sus estimaciones y gastos." : "No hay viajes en esta selección."}
        </p>
      )}
      {!loading && view === "trips" && viewMode === "list" && filteredTrips.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th className="p-3">Viaje</th><th className="p-3">Fechas</th><th className="p-3">Viajeros</th><th className="p-3">Estado</th><th className="p-3">Presupuesto</th><th className="p-3">Gastos</th><th className="p-3">Acción</th>
            </tr></thead>
            <tbody>{filteredTrips.map((trip) => {
              const summary = getTripBudgetSummary(trip);
              return <tr key={trip.id} className="border-t border-slate-100">
                <td className="p-3"><p className="font-semibold">{trip.name}</p><p className="text-slate-600">{trip.origin ? `${trip.origin} → ` : ""}{trip.destination}</p></td>
                <td className="p-3">{formatIsoDate(trip.startDate)} – {formatIsoDate(trip.endDate)}</td>
                <td className="p-3">{trip.travelers}</td><td className="p-3 capitalize">{trip.status}</td>
                <td className="p-3">{money(trip.budget, trip.currency)}</td><td className="p-3">{money(summary.actualExpenses, trip.currency)}</td>
                <td className="p-3"><button type="button" onClick={() => setViewMode("cards")} className="min-h-10 rounded-lg border px-3 font-medium">Gestionar</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {!loading && view === "trips" && viewMode === "list" && <p className="text-xs text-slate-500">El listado está preparado para desplazamiento horizontal dentro de la tabla en pantallas pequeñas.</p>}
      {!loading && view === "budget" && filteredTrips.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["EUR", "USD", "GBP", "MAD"] as const).map((currency) => {
            const currencyTrips = filteredTrips.filter((trip) => trip.currency === currency);
            if (!currencyTrips.length) return null;
            const totals = currencyTrips.reduce((sum, trip) => {
              const summary = getTripBudgetSummary(trip);
              return { budget: sum.budget + trip.budget, actual: sum.actual + summary.actualExpenses, estimate: sum.estimate + summary.totalEstimated, unknown: sum.unknown + summary.unknownActivityPrices };
            }, { budget: 0, actual: 0, estimate: 0, unknown: 0 });
            return <dl key={currency} className="rounded-2xl border border-slate-200 bg-white p-4">
              <dt className="font-semibold">Resumen agregado · {currency} · {currencyTrips.length} viajes</dt>
              <dd className="mt-2 grid grid-cols-2 gap-2 text-sm"><span>Presupuesto {money(totals.budget, currency)}</span><span>Gastos {money(totals.actual, currency)}</span><span>Estimado pendiente {money(totals.estimate, currency)}</span><span>Precios desconocidos {totals.unknown}</span></dd>
            </dl>;
          })}
        </div>
      )}
      {!loading && (view === "budget" || viewMode === "cards") && <div className="grid min-w-0 gap-5 2xl:grid-cols-2">
      {filteredTrips.map((trip) => (
        <article id={`trip-${trip.id}`} key={trip.id} className="min-w-0 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold sm:text-2xl">{trip.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{trip.origin ? `${trip.origin} → ` : ""}{trip.destination} · {trip.itinerary.length} días</p>
              <p className="text-xs text-slate-500">Salida: {formatIsoDate(trip.startDate)} · Regreso: {formatIsoDate(trip.endDate)} · {trip.travelers} viajeros</p>
              <p className="text-xs text-slate-500">Horario general de actividades: 09:00–21:00 · no representa horarios de transporte.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs capitalize text-emerald-800">{trip.status}</span>
              {trip.status !== "completado" && <button type="button" onClick={() => void updateTrip(trip.id, { status: "completado" }).then(() => afterSuccess("Viaje marcado como completado")).catch((error: unknown) => setError(error instanceof Error ? error.message : "No se pudo completar el viaje."))} className="min-h-10 rounded-full border border-emerald-200 px-3 py-1 text-sm text-emerald-800">Completar</button>}
              {view === "trips" && <button type="button" onClick={() => void duplicateTrip(trip)} className="min-h-10 rounded-full border border-slate-300 px-3 py-1 text-sm">Duplicar</button>}
              <button onClick={() => void removeTrip(trip)} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-700">Eliminar</button>
            </div>
          </div>

          {view === "trips" && <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">Editar datos del viaje</summary>
            <form onSubmit={(event) => void saveTripDetails(event, trip)} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {([
                ["name", "Nombre del viaje", "text"],
                ["origin", "Origen", "text"],
                ["destination", "Destino", "text"],
                ["startDate", "Fecha de salida", "date"],
                ["endDate", "Fecha de regreso", "date"],
                ["travelers", "Viajeros", "number"],
                ["budget", "Presupuesto inicial", "number"],
              ] as const).map(([key, label, type]) => (
                <label key={key} className="text-sm font-medium text-slate-700">{label}
                  <input type={type}
                    min={type === "number" ? (key === "travelers" ? 1 : 0)
                      : key === "startDate" || key === "endDate"
                        ? tripDateMinimum(trip, tripDrafts[trip.id], key, today)
                        : undefined}
                    max={key === "travelers" ? 100 : undefined}
                    step={key === "budget" ? "0.01" : "1"} required={key !== "origin"} value={tripDrafts[trip.id]?.[key] ?? ""}
                    onChange={(event) => key === "startDate" || key === "endDate"
                      ? updateTripDateDraft(trip, key, event.target.value)
                      : setTripDrafts((drafts) => ({ ...drafts, [trip.id]: { ...drafts[trip.id], [key]: event.target.value } }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                </label>
              ))}
              <label className="text-sm font-medium text-slate-700">Moneda
                <select value={tripDrafts[trip.id]?.currency ?? trip.currency} onChange={(event) => setTripDrafts({ ...tripDrafts, [trip.id]: { ...tripDrafts[trip.id], currency: event.target.value as Currency } })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3">
                  {(["EUR", "USD", "GBP", "MAD"] as const).map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Estado
                <select value={tripDrafts[trip.id]?.status ?? trip.status} onChange={(event) => setTripDrafts({ ...tripDrafts, [trip.id]: { ...tripDrafts[trip.id], status: event.target.value as TripStatus } })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3">
                  {(["borrador", "planificado", "activo", "completado"] as const).map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <p className="self-center text-xs text-slate-600">Al mover las fechas, se mantienen las jornadas y sus horarios. Para cambiar el número de días, crea o regenera el itinerario desde el asistente.</p>
              <button className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Guardar datos del viaje</button>
            </form>
          </details>}
          <form onSubmit={(event) => void saveBudget(event, trip)} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-3">
            <label className="text-xs text-slate-600">Presupuesto
              <input type="number" min={0} step="0.01" required value={budgetDrafts[trip.id] ?? ""} onChange={(event) => setBudgetDrafts({ ...budgetDrafts, [trip.id]: event.target.value })} className="mt-1 block w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-600">Moneda
              <select value={currencyDrafts[trip.id] ?? trip.currency} onChange={(event) => setCurrencyDrafts({ ...currencyDrafts, [trip.id]: event.target.value as Currency })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                {(["EUR", "USD", "GBP", "MAD"] as const).map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Guardar presupuesto</button>
          </form>
          {(() => {
            const summary = getTripBudgetSummary(trip);
            const otherCurrencyExpenses = trip.expenses.filter((expense) => expense.currency !== trip.currency);
            const otherCurrencyEstimates = trip.itinerary.flatMap((day) => day.items)
              .filter((activity) => activity.estimate !== undefined && activity.currency !== trip.currency);
            return (
              <dl className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Costes estimados del itinerario</dt><dd className="font-semibold">{money(summary.totalEstimated, trip.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">Gastos reales registrados</dt><dd className="font-semibold">{money(summary.actualExpenses, trip.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">Disponible actual</dt><dd className="font-semibold">{money(summary.remainingBudget, trip.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">Disponible proyectado</dt><dd className="font-semibold">{money(summary.projectedRemaining, trip.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">Precios de actividades desconocidos</dt><dd className="font-semibold">{summary.unknownActivityPrices}{summary.projectionIncomplete ? " · proyección incompleta" : " · completos"}</dd></div>
                {otherCurrencyExpenses.length > 0 && (
                  <div className="text-xs text-amber-800 sm:col-span-2">
                    Gastos en otras monedas, excluidos del cálculo anterior: {otherCurrencyExpenses.map((expense) => `${expense.description}: ${money(expense.amount, expense.currency)}`).join("; ")}.
                  </div>
                )}
                {otherCurrencyEstimates.length > 0 && (
                  <div className="text-xs text-amber-800 sm:col-span-2">
                    Estimaciones en otras monedas, excluidas del cálculo anterior: {otherCurrencyEstimates.map((activity) => `${activity.name}: ${money(activity.estimate ?? 0, activity.currency)}`).join("; ")}.
                  </div>
                )}
              </dl>
            );
          })()}

          {(view === "trips" || (view === "budget" && budgetTab === "activities")) && (
            <div className="mt-5 space-y-4">
              {trip.itinerary.map((day) => (
                <section key={day.id} className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="font-semibold">Día {day.dayNumber}{dayDateLabel(day, trip.startDate)}: {day.theme}</h3>
                  <p className="text-xs text-slate-500">Horario general de actividades: 09:00–21:00</p>
                  {view === "trips" && <RegenerateDayControl
                    trip={trip}
                    day={day}
                    onSaved={(source) => void afterSuccess(`Jornada reorganizada (${source === "openrouter" ? "OpenRouter" : "modo demo"})`)}
                    onError={setError}
                  />}
                  {day.items.map((activity, activityIndex) => (
                    <div id={`activity-${activity.id}`} key={activity.id} className={`mt-3 scroll-mt-6 rounded-xl border p-3 ${
                      activity.blockType === "travel" ? "border-sky-200 bg-sky-50" :
                      activity.blockType === "breakfast" || activity.blockType === "lunch" || activity.blockType === "dinner" ? "border-orange-200 bg-orange-50" :
                      activity.blockType === "rest" || activity.blockType === "free_time" ? "border-violet-200 bg-violet-50" :
                      "border-slate-200 bg-slate-50"
                    }`}>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {activity.startTime && activity.endTime
                          ? <span className="font-semibold tabular-nums">{activity.startTime}–{activity.endTime}</span>
                          : <span className="text-slate-500">Horario no disponible (itinerario anterior)</span>}
                        <span>{getBlockTypeLabel(activity.blockType)}</span>
                        <span className="font-medium">{activity.name}</span>
                        {view === "trips" && <span className="ml-auto inline-flex gap-1">
                          <button type="button" aria-label={`Mover ${activity.name} arriba`} disabled={activityIndex === 0}
                            onClick={() => void moveActivity(trip, day, activityIndex, -1)} className="min-h-9 min-w-9 rounded-lg border border-slate-300 disabled:opacity-40">↑</button>
                          <button type="button" aria-label={`Mover ${activity.name} abajo`} disabled={activityIndex === day.items.length - 1}
                            onClick={() => void moveActivity(trip, day, activityIndex, 1)} className="min-h-9 min-w-9 rounded-lg border border-slate-300 disabled:opacity-40">↓</button>
                        </span>}
                        <span>{activity.durationMinutes} min</span>
                        {activity.location && <span>{activity.location}</span>}
                        {activity.blockType === "travel" && activity.travelMinutes !== undefined && <span>{activity.travelMinutes} min de trayecto (estimación)</span>}
                        {(activity.blockType === undefined || activity.blockType === "activity") && activity.pricePerPerson !== undefined && (
                          <span>{money(activity.pricePerPerson, activity.currency)} por persona</span>
                        )}
                        {(activity.blockType === undefined || activity.blockType === "activity") && activity.priceStatus === "free_verified"
                          ? <span className="text-emerald-800">{priceStatusLabel(activity.priceStatus)} · 0</span>
                          : activity.estimate !== undefined && activity.priceStatus !== "unknown"
                            ? <span>{money(activity.estimate, activity.currency)} total para {trip.travelers} · {priceStatusLabel(activity.priceStatus)}</span>
                            : (activity.blockType === undefined || activity.blockType === "activity") && <span className="text-amber-800">{priceStatusLabel(activity.priceStatus)}</span>}
                        {activity.budgetCategory === "gastronomy" && <span className="text-amber-800">Excluido del presupuesto de visitas</span>}
                        {activity.reliability && <span>Fiabilidad de datos: {activity.reliability}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{activity.description}</p>
                      {(activity.blockType === undefined || activity.blockType === "activity") && (
                        <ActivityForm trip={trip} activity={activity} onSaved={() => void afterSuccess("Actividad")} onError={setError} />
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}

          {(view === "trips" || (view === "budget" && budgetTab === "expenses")) && <details open={view === "budget"} className="mt-4 rounded-2xl bg-amber-50 p-4">
            <summary className="cursor-pointer font-medium text-amber-950">Gastos ({trip.expenses.length})</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {trip.expenses.map((expense) => (
                <ExpenseEditor key={expense.id} trip={trip} expense={expense}
                  onSaved={() => void afterSuccess("Gasto")} onError={setError} />
              ))}
              {trip.expenses.length === 0 && <li className="text-slate-600">Aún no hay gastos registrados.</li>}
            </ul>
            <ExpenseForm trip={trip} onSaved={() => void afterSuccess("Gasto")} onError={setError} />
          </details>}
        </article>
      ))}
      </div>}
    </section>
  );
}
