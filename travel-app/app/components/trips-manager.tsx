"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { addExpense, deleteTrip, listTrips, persistenceLabel, updateActivity, updateTrip } from "@/app/lib/persistence/client";
import { calculateScheduledEnd, getBlockTypeLabel } from "@/app/lib/itinerary-schedule";
import { addIsoDays, formatIsoDate } from "@/app/lib/date-format";
import { getTripBudgetSummary } from "@/app/lib/itinerary";
import type { SavedTrip } from "@/app/lib/persistence/types";
import type { Currency } from "@/app/lib/types";

type View = "trips" | "budget";

function money(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
}

function dayDateLabel(day: SavedTrip["itinerary"][number], startDate: string | null): string {
  const date = day.date ?? (startDate ? addIsoDays(startDate, day.dayNumber - 1) : undefined);
  return date ? ` · ${formatIsoDate(date)}` : "";
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
  const [pricePerPerson, setPricePerPerson] = useState(
    activity.pricePerPerson?.toString() ??
    (activity.estimate && trip.travelers ? (activity.estimate / trip.travelers).toFixed(2) : ""),
  );
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const endTime = activity.startTime ? calculateScheduledEnd(activity.startTime, durationMinutes) : undefined;
      if (activity.startTime && !endTime) {
        throw new Error("La duración no cabe en el horario diario de 09:00 a 21:00.");
      }
      await updateActivity(trip.id, {
        ...activity,
        name,
        description,
        durationMinutes,
        ...(endTime ? { endTime } : {}),
        ...(pricePerPerson.trim()
          ? {
              pricePerPerson: Number(pricePerPerson),
              estimate: Number((Number(pricePerPerson) * trip.travelers).toFixed(2)),
              priceStatus: "estimate",
            }
          : {
              pricePerPerson: undefined,
              estimate: undefined,
              priceStatus: "unknown",
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
      <label className="text-xs text-slate-600 sm:col-span-2">Descripción
        <input value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Precio estimado por persona ({activity.currency})
        <input type="number" min={0.01} step="0.01" value={pricePerPerson} onChange={(event) => setPricePerPerson(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <p className="self-end text-xs text-slate-500">{pricePerPerson ? `Total para ${trip.travelers}: ${money(Number(pricePerPerson) * trip.travelers, activity.currency)}` : "Deja vacío si el precio no se conoce."}</p>
      <button disabled={saving} className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
        {saving ? "Guardando..." : "Guardar actividad"}
      </button>
    </form>
  );
}

function ExpenseForm({ trip, onSaved, onError }: { trip: SavedTrip; onSaved: () => void; onError: (message: string) => void }) {
  const [category, setCategory] = useState("Actividad");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await addExpense(trip.id, { category, description, amount: Number(amount), currency: trip.currency, incurredOn });
      setDescription("");
      setAmount("");
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo registrar el gasto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-2 rounded-xl bg-white p-3 sm:grid-cols-4">
      <label className="text-xs text-slate-600">Categoría
        <input value={category} maxLength={80} required onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Descripción
        <input value={description} maxLength={240} required onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-slate-600">Importe ({trip.currency})
        <input type="number" min={0} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-slate-600">Fecha
          <input type="date" required value={incurredOn} onChange={(event) => setIncurredOn(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <button disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "..." : "Añadir"}
        </button>
      </div>
    </form>
  );
}

export function TripsManager({ view }: { view: View }) {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [currencyDrafts, setCurrencyDrafts] = useState<Record<string, Currency>>({});

  const refresh = useCallback(async (): Promise<boolean> => {
    setError("");
    try {
      const result = await listTrips();
      setTrips(result);
      setBudgetDrafts(Object.fromEntries(result.map((trip) => [trip.id, String(trip.budget)])));
      setCurrencyDrafts(Object.fromEntries(result.map((trip) => [trip.id, trip.currency])));
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

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Almacenamiento: {persistenceLabel()}</p>
        {view === "trips" && <Link href="/ia" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Generar itinerario</Link>}
      </div>
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p>{error}</p>
          {error.includes("Inicia sesión") && <Link className="mt-2 inline-block font-semibold underline" href="/cuenta">Ir a la cuenta</Link>}
        </div>
      )}
      {notice && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {loading && <p className="text-sm text-slate-600">Cargando viajes...</p>}
      {!loading && trips.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium">Todavía no hay viajes guardados.</p>
          <Link href="/ia" className="mt-3 inline-block text-sm font-semibold text-emerald-700">Genera un itinerario</Link>
        </div>
      )}
      {!loading && <div className="grid min-w-0 gap-5 2xl:grid-cols-2">
      {trips.map((trip) => (
        <article key={trip.id} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold sm:text-2xl">{trip.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{trip.origin ? `${trip.origin} → ` : ""}{trip.destination} · {trip.itinerary.length} días</p>
              <p className="text-xs text-slate-500">Salida: {formatIsoDate(trip.startDate)} · Regreso: {formatIsoDate(trip.endDate)} · {trip.travelers} viajeros</p>
              <p className="text-xs text-slate-500">Horario general de actividades: 09:00–21:00 · no representa horarios de transporte.</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs capitalize text-emerald-800">{trip.status}</span>
              <button onClick={() => void removeTrip(trip)} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-700">Eliminar</button>
            </div>
          </div>

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
                <div><dt className="text-xs text-slate-500">Presupuesto restante tras gastos reales</dt><dd className="font-semibold">{money(summary.remainingBudget, trip.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">Restante proyectado tras estimaciones</dt><dd className="font-semibold">{money(summary.projectedRemaining, trip.currency)}</dd></div>
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

          {view === "trips" && (
            <div className="mt-5 space-y-4">
              {trip.itinerary.map((day) => (
                <section key={day.id} className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="font-semibold">Día {day.dayNumber}{dayDateLabel(day, trip.startDate)}: {day.theme}</h3>
                  <p className="text-xs text-slate-500">Horario general de actividades: 09:00–21:00</p>
                  {day.items.map((activity) => (
                    <div key={activity.id} className={`mt-3 rounded-xl border p-3 ${
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
                        <span>{activity.durationMinutes} min</span>
                        {activity.location && <span>{activity.location}</span>}
                        {activity.blockType === "travel" && activity.travelMinutes !== undefined && <span>{activity.travelMinutes} min de trayecto (estimación)</span>}
                        {activity.estimate !== undefined && activity.priceStatus !== "unknown"
                          ? <span>{money(activity.estimate, activity.currency)} total estimado para {trip.travelers}</span>
                          : (activity.blockType === undefined || activity.blockType === "activity") && <span className="text-amber-800">Precio no disponible</span>}
                        {activity.budgetCategory === "gastronomy" && <span className="text-amber-800">Excluido del presupuesto de visitas</span>}
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

          <details className="mt-4 rounded-2xl bg-amber-50 p-4">
            <summary className="cursor-pointer font-medium text-amber-950">Gastos ({trip.expenses.length})</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {trip.expenses.map((expense) => (
                <li key={expense.id} className="flex flex-wrap justify-between gap-2 border-b border-amber-100 pb-2">
                  <span>{expense.incurredOn} · {expense.category}: {expense.description}</span>
                  <strong>{money(expense.amount, expense.currency)}</strong>
                </li>
              ))}
              {trip.expenses.length === 0 && <li className="text-slate-600">Aún no hay gastos registrados.</li>}
            </ul>
            <ExpenseForm trip={trip} onSaved={() => void afterSuccess("Gasto")} onError={setError} />
          </details>
        </article>
      ))}
      </div>}
    </section>
  );
}
