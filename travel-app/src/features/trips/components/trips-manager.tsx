"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { addExpense, createActivity, deleteActivity, deleteExpense, deleteTrip, listTrips, persistenceLabel, reorderActivities, updateActivity, updateExpense, updateTrip } from "@/lib/persistence/client";
import { calculateScheduledEnd, moveItineraryActivity, proposeActivitySchedule } from "@/lib/itinerary-schedule";
import { addIsoDays, formatIsoDate } from "@/lib/date-format";
import { getTripBudgetSummary } from "@/lib/itinerary";
import { sumAmountsInMinorUnits } from "@/lib/money";
import { TripCalendar } from "@/features/calendar/components/trip-calendar";
import type { SavedExpense, SavedTrip } from "@/lib/persistence/types";
import type { Currency, ItineraryDay, TripStatus } from "@/lib/types";
import { useLocalToday } from "@/lib/hooks/use-local-today";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";
import { Button } from "@/components/ui";
import { ActivityEditor, getActivityCategoryClasses } from "@/features/itinerary/components/activity-editor";
import { ActivityAssistant } from "@/features/itinerary/components/activity-assistant";
import { ItineraryDayHeader } from "@/features/itinerary/components/itinerary-day-header";
import { ActivityCreateForm } from "@/features/itinerary/components/activity-create-form";
import { ActivitySummary } from "@/features/itinerary/components/activity-summary";

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

const tripFilterLabels: Record<TripFilter, string> = {
  all: "Todos",
  future: "Futuros",
  active: "En curso",
  completed: "Completados",
  drafts: "Borradores",
};

function money(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [budgetTripId, setBudgetTripId] = useState("");
  const [budgetTab, setBudgetTab] = useState<"activities" | "expenses">("activities");
  const [addingDayId, setAddingDayId] = useState<string | null>(null);
  const [reorderDrafts, setReorderDrafts] = useState<Record<string, string[]>>({});
  const [reorderChoice, setReorderChoice] = useState<Record<string, "keep" | "adjust">>({});
  const [draggedActivityId, setDraggedActivityId] = useState<string | null>(null);

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

  const removeActivity = async (trip: SavedTrip, day: ItineraryDay, activityId: string, name: string) => {
    if (!window.confirm(`¿Eliminar «${name}» de esta jornada? Los gastos asociados se conservarán sin vincular a esta actividad.`)) return;
    try {
      await deleteActivity(trip.id, day.id, activityId);
      await afterSuccess("Actividad eliminada");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la actividad.");
    }
  };

  const saveDayOrder = async (trip: SavedTrip, day: ItineraryDay) => {
    const byId = new Map(day.items.map((item) => [item.id, item]));
    const requestedIds = reorderDrafts[day.id];
    if (!requestedIds) return;
    const requestedSet = new Set(requestedIds);
    const ids = [...requestedIds.filter((id) => byId.has(id)), ...day.items.filter((item) => !requestedSet.has(item.id)).map((item) => item.id)];
    const ordered: ItineraryDay["items"] = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (item) ordered.push(item);
    }
    const adjust = reorderChoice[day.id] === "adjust";
    const proposed = adjust ? proposeActivitySchedule(ordered) : undefined;
    if (adjust && !proposed) {
      setError("No se pudieron proponer horarios válidos para el orden elegido. Ajusta las duraciones o conserva los horarios actuales.");
      return;
    }
    let orderWasSaved = false;
    try {
      await reorderActivities(trip.id, day.id, ids);
      orderWasSaved = true;
      if (proposed) {
        for (const updated of proposed) {
          const original = byId.get(updated.id);
          if (original && (original.startTime !== updated.startTime || original.endTime !== updated.endTime)) {
            await updateActivity(trip.id, updated);
          }
        }
      }
      setReorderDrafts((drafts) => { const next = { ...drafts }; delete next[day.id]; return next; });
      setReorderChoice((choices) => { const next = { ...choices }; delete next[day.id]; return next; });
      await afterSuccess(adjust ? "Orden y horarios" : "Orden de actividades");
    } catch (reorderError) {
      await refresh();
      setError(reorderError instanceof Error
        ? `${orderWasSaved ? "El orden se guardó, pero no se pudieron aplicar todos los cambios de horario. " : ""}${reorderError.message} Se ha recargado el estado confirmado por el servidor.`
        : `${orderWasSaved ? "El orden se guardó, pero algunos horarios pueden no haberse actualizado. " : ""}Se ha recargado el estado confirmado por el servidor.`);
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
  const activeFilterCount = Number(Boolean(searchQuery.trim())) + Number(tripFilter !== "all");

  const clearTripFilters = () => {
    setSearchQuery("");
    setTripFilter("all");
  };

  return (
    <section className={`trip-manager trip-manager--${view} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Almacenamiento: {persistenceLabel()}</p>
        {view === "trips" && <Link href="/ia" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Generar itinerario</Link>}
      </div>
      <div className="grid min-w-0 gap-3">
        {view === "trips" ? (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Forma de ver los viajes">
              <button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${viewMode === "cards" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Tarjetas</button>
              <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${viewMode === "list" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Lista</button>
              <button type="button" aria-pressed={viewMode === "calendar"} onClick={() => setViewMode("calendar")} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${viewMode === "calendar" ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Calendario</button>
            </div>
            <div className="grid min-w-0 w-full gap-2 sm:grid-cols-[minmax(12rem,1fr)_minmax(9rem,auto)_auto]">
              <label className="min-w-0 text-sm font-medium text-slate-700">Buscar viaje
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nombre o destino" className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" />
              </label>
              <label className="min-w-0 text-sm font-medium text-slate-700">Estado
                <select aria-label="Filtrar por estado" value={tripFilter} onChange={(event) => setTripFilter(event.target.value as TripFilter)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
                  <option value="all">Todos</option><option value="future">Futuros</option><option value="active">En curso</option><option value="completed">Completados</option><option value="drafts">Borradores</option>
                </select>
              </label>
              <Button type="button" variant="outline" className="mt-auto w-full whitespace-nowrap sm:w-auto" aria-expanded={filtersOpen} aria-controls="trip-more-filters" onClick={() => setFiltersOpen((open) => !open)}>
                <span className="sm:hidden">Filtros</span><span className="hidden sm:inline">Más filtros</span>
                {activeFilterCount > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900" aria-label={`${activeFilterCount} ${activeFilterCount === 1 ? "filtro activo" : "filtros activos"}`}>{activeFilterCount}</span>}
              </Button>
            </div>
            {filtersOpen && <div id="trip-more-filters" className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                <label className="text-sm font-medium text-slate-700">Ordenar resultados
                  <select value={tripSort} onChange={(event) => setTripSort(event.target.value as TripSort)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
                    <option value="startDate">Fecha de inicio</option><option value="destination">Destino</option><option value="status">Estado</option><option value="budget">Presupuesto</option>
                  </select>
                </label>
                <p className="text-sm text-slate-600">Los resultados se actualizan al cambiar una opción.</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={clearTripFilters} disabled={activeFilterCount === 0}>Limpiar filtros</Button>
                <Button type="button" size="sm" onClick={() => setFiltersOpen(false)}>Listo</Button>
              </div>
            </div>}
            {activeFilterCount > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Filtros activos">
              <span className="text-xs font-semibold text-slate-600">Activos:</span>
              {searchQuery.trim() && <button type="button" onClick={() => setSearchQuery("")} className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100">Búsqueda: <span className="max-w-40 truncate">{searchQuery.trim()}</span><span aria-hidden="true">×</span><span className="sr-only">Quitar búsqueda</span></button>}
              {tripFilter !== "all" && <button type="button" onClick={() => setTripFilter("all")} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100">Estado: {tripFilterLabels[tripFilter]}<span aria-hidden="true">×</span><span className="sr-only">Quitar filtro de estado</span></button>}
              <Button type="button" variant="ghost" size="sm" className="min-h-8 px-2 text-xs" onClick={clearTripFilters}>Limpiar filtros</Button>
            </div>}
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
            const summaries = currencyTrips.map(getTripBudgetSummary);
            const totals = {
              budget: sumAmountsInMinorUnits(currencyTrips.map((trip) => trip.budget), currency),
              actual: sumAmountsInMinorUnits(summaries.map((summary) => summary.actualExpenses), currency),
              estimate: sumAmountsInMinorUnits(summaries.map((summary) => summary.totalEstimated), currency),
              unknown: summaries.reduce((sum, summary) => sum + summary.unknownActivityPrices, 0),
            };
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
              <p className="text-xs text-slate-500">Los horarios son flexibles y se ajustan a cada jornada.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs capitalize text-emerald-800">{trip.status}</span>
              {trip.status !== "completado" && <button type="button" onClick={() => void updateTrip(trip.id, { status: "completado" }).then(() => afterSuccess("Viaje marcado como completado")).catch((error: unknown) => setError(error instanceof Error ? error.message : "No se pudo completar el viaje."))} className="min-h-10 rounded-full border border-emerald-200 px-3 py-1 text-sm text-emerald-800">Completar</button>}
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
              {trip.itinerary.map((day) => {
                const draftOrder = reorderDrafts[day.id];
                const displayedItems = draftOrder
                  ? (() => {
                    const ordered = draftOrder.flatMap((id) => day.items.filter((item) => item.id === id));
                    const known = new Set(ordered.map((item) => item.id));
                    return [...ordered, ...day.items.filter((item) => !known.has(item.id))];
                  })()
                  : day.items;
                const proposedSchedule = draftOrder
                  ? proposeActivitySchedule(displayedItems)
                  : undefined;
                const conflicts = displayedItems.flatMap((item, index) => displayedItems.slice(index + 1).flatMap((other) => {
                  if (!item.startTime || !item.endTime || !other.startTime || !other.endTime) return [];
                  return item.startTime < other.endTime && other.startTime < item.endTime ? [`${item.name} · ${other.name}`] : [];
                }));
                return <section key={day.id} className="rounded-2xl border border-slate-200 p-4">
                  <ItineraryDayHeader dayNumber={day.dayNumber} dateLabel={dayDateLabel(day, trip.startDate).replace(/^ · /, "")} title={day.theme} activityCount={day.items.length} editable={view === "trips"} adding={addingDayId === day.id} reorganizing={Boolean(draftOrder)} onAdd={() => { setAddingDayId(addingDayId === day.id ? null : day.id); setError(""); }} onToggleReorganization={() => {
                    if (draftOrder) {
                      setReorderDrafts((drafts) => { const next = { ...drafts }; delete next[day.id]; return next; });
                      setReorderChoice((choices) => { const next = { ...choices }; delete next[day.id]; return next; });
                    } else {
                      setReorderDrafts((drafts) => ({ ...drafts, [day.id]: day.items.map((item) => item.id) }));
                      setReorderChoice((choices) => ({ ...choices, [day.id]: "keep" }));
                    }
                  }} />
                  {addingDayId === day.id && <ActivityCreateForm currency={trip.currency} existingItems={day.items} confirmOverlaps suggestedStart={day.items.at(-1)?.endTime ? calculateScheduledEnd(day.items.at(-1)!.endTime!, 15) ?? day.items.at(-1)!.endTime! : "09:00"} onCancel={() => setAddingDayId(null)} onSave={async (activity) => {
                    const result = await createActivity(trip.id, day, activity);
                    setAddingDayId(null);
                    void afterSuccess("Actividad").then(() => {
                      if (!result.orderUpdated) setNotice(`Actividad guardada; el orden no se pudo actualizar (${result.orderErrorCode ?? "c?digo no disponible"}). Reorganiza la jornada para reintentar.`);
                    });
                  }} />}
                  {displayedItems.map((activity, activityIndex) => (
                    <article id={`activity-${activity.id}`} key={activity.id}
                      draggable={Boolean(draftOrder)}
                      onDragStart={(event) => {
                        const target = event.target;
                        if (!draftOrder || !(target instanceof HTMLElement) || target.closest("button,input,textarea,select,summary,a")) { event.preventDefault(); return; }
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", activity.id);
                        setDraggedActivityId(activity.id);
                      }}
                      onDragOver={(event) => { if (draftOrder) event.preventDefault(); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = event.dataTransfer.getData("text/plain") || draggedActivityId;
                        if (!draftOrder || !sourceId || sourceId === activity.id) return;
                        const next = moveItineraryActivity(displayedItems, sourceId, activity.id).map((item) => item.id);
                        setReorderDrafts((drafts) => ({ ...drafts, [day.id]: next }));
                        setDraggedActivityId(null);
                      }}
                      onDragEnd={() => setDraggedActivityId(null)}
                      className={`mt-3 scroll-mt-6 rounded-xl border p-3 ${getActivityCategoryClasses(activity)} ${draggedActivityId === activity.id ? "opacity-50" : ""} ${draftOrder ? "cursor-grab border-dashed active:cursor-grabbing" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {draftOrder && <span aria-hidden="true" className="text-slate-500">⠿</span>}
                        <ActivitySummary activity={activity} />
                        {draftOrder && <div className="ml-auto flex gap-1">
                          <button type="button" aria-label={`Mover ${activity.name} arriba`} disabled={activityIndex === 0} onClick={() => { const ids = moveItineraryActivity(displayedItems, activity.id, displayedItems[activityIndex - 1].id).map((item) => item.id); setReorderDrafts((drafts) => ({ ...drafts, [day.id]: ids })); }} className="min-h-9 min-w-9 rounded-lg border bg-white disabled:opacity-40">↑</button>
                          <button type="button" aria-label={`Mover ${activity.name} abajo`} disabled={activityIndex === displayedItems.length - 1} onClick={() => { const ids = moveItineraryActivity(displayedItems, activity.id, displayedItems[activityIndex + 1].id).map((item) => item.id); setReorderDrafts((drafts) => ({ ...drafts, [day.id]: ids })); }} className="min-h-9 min-w-9 rounded-lg border bg-white disabled:opacity-40">↓</button>
                        </div>}
                      </div>
                      <details className="mt-2 text-sm"><summary className="w-fit cursor-pointer text-xs font-medium text-emerald-800 underline">Editar y ver detalles</summary>
                        <div className="mt-2 rounded-lg bg-white p-3">
                          <p className="mb-2 text-xs text-slate-600">{activity.durationMinutes} min{activity.location ? ` · ${activity.location}` : ""}{activity.description ? ` · ${activity.description}` : ""}</p>
                          <ActivityEditor key={`${activity.id}-${activity.name}-${activity.startTime}-${activity.durationMinutes}`} initiallyEditing activity={activity} travelers={trip.travelers} onSave={async (updated) => { await updateActivity(trip.id, updated); await afterSuccess("Actividad"); }} />
                          <ActivityAssistant activity={activity} context={{ destination: trip.destination, origin: trip.origin, interests: trip.interests, travelers: trip.travelers, budget: trip.budget, currency: trip.currency, travelType: trip.travelType }} onApplyAlternative={(alternative) => {
                            const startTime = activity.startTime;
                            const endTime = startTime ? calculateScheduledEnd(startTime, alternative.durationMinutes) : undefined;
                            if (!startTime || !endTime) { setError("Añade una hora de inicio válida antes de sustituir la actividad."); return; }
                            const replacement = { ...activity, name: alternative.name, description: alternative.description, location: alternative.location, durationMinutes: alternative.durationMinutes, startTime, endTime, pricePerPerson: undefined, estimate: undefined, priceStatus: "unknown" as const };
                            const overlaps = day.items.some((other) => other.id !== activity.id && other.startTime && other.endTime && startTime < other.endTime && other.startTime < endTime);
                            if (overlaps) { setError("La alternativa se solapa con otra actividad. Ajusta el horario antes de sustituirla."); return; }
                            void updateActivity(trip.id, replacement).then(() => afterSuccess("Alternativa de actividad")).catch((saveError: unknown) => setError(saveError instanceof Error ? saveError.message : "No se pudo sustituir la actividad."));
                          }} />
                          {view === "trips" && <div className="mt-3 flex justify-end"><button type="button" onClick={() => void removeActivity(trip, day, activity.id, activity.name)} className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700">Eliminar actividad</button></div>}
                        </div>
                      </details>
                    </article>
                  ))}
                  {draftOrder && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <fieldset><legend className="text-sm font-semibold">Cómo tratar los horarios</legend>
                      <label className="mt-2 flex gap-2 text-sm"><input type="radio" name={`schedule-${day.id}`} checked={reorderChoice[day.id] === "keep"} onChange={() => setReorderChoice((choices) => ({ ...choices, [day.id]: "keep" }))} />Mantener horarios actuales</label>
                      <label className="mt-2 flex gap-2 text-sm"><input type="radio" name={`schedule-${day.id}`} checked={reorderChoice[day.id] === "adjust"} onChange={() => setReorderChoice((choices) => ({ ...choices, [day.id]: "adjust" }))} />Proponer horarios según el nuevo orden</label>
                    </fieldset>
                    {reorderChoice[day.id] === "keep" && conflicts.length > 0 && <p role="alert" className="mt-2 text-sm text-red-800">Los horarios se solapan: {conflicts.join(", ")}. Puedes guardar el orden y corregirlos después.</p>}
                    {reorderChoice[day.id] === "adjust" && (proposedSchedule ? <ol className="mt-2 space-y-1 text-sm">{proposedSchedule.map((item) => <li key={item.id}><span className="font-semibold tabular-nums">{item.startTime}–{item.endTime}</span> · {item.name}</li>)}</ol> : <p role="alert" className="mt-2 text-sm text-red-800">No hay una propuesta posible dentro del mismo día.</p>)}
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void saveDayOrder(trip, day)} disabled={reorderChoice[day.id] === "adjust" && !proposedSchedule} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-40">Confirmar y guardar orden</button><button type="button" onClick={() => { setReorderDrafts((drafts) => { const next = { ...drafts }; delete next[day.id]; return next; }); setReorderChoice((choices) => { const next = { ...choices }; delete next[day.id]; return next; }); }} className="min-h-10 rounded-lg border bg-white px-3 text-sm">Cancelar</button></div>
                  </div>}
                </section>;
              })}
            </div>
          )}          {(view === "trips" || (view === "budget" && budgetTab === "expenses")) && <details open={view === "budget"} className="mt-4 rounded-2xl bg-amber-50 p-4">
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
