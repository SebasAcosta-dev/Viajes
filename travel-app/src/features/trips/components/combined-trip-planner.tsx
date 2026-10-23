"use client";

import { useCallback, useEffect, useState } from "react";
import { addIsoDays, formatIsoDate } from "@/lib/date-format";
import { createTripGroup, listTrips, listTripGroups } from "@/lib/persistence/client";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";
import { getTripBudgetSummary } from "@/lib/itinerary";
import { formatMoney, sumAmountsInMinorUnits } from "@/lib/money";
import type { SavedTrip, SavedTripGroup, TripGroupItem } from "@/lib/persistence/types";

interface SelectedTrip extends TripGroupItem {
  trip: SavedTrip;
}

interface DateRelation {
  beforeTripId: string;
  afterTripId: string;
  kind: "overlap" | "gap";
  days: number;
}

export function analyzeTripGroupDates(items: SelectedTrip[]): DateRelation[] {
  const relations: DateRelation[] = [];
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const next = items[index];
    if (!previous.endDate || !next.startDate) continue;
    if (next.startDate <= previous.endDate) {
      const overlapDays = (Date.parse(`${previous.endDate}T00:00:00Z`) - Date.parse(`${next.startDate}T00:00:00Z`)) / 86_400_000 + 1;
      relations.push({ beforeTripId: previous.tripId, afterTripId: next.tripId, kind: "overlap", days: overlapDays });
    } else {
      const followingDay = addIsoDays(previous.endDate, 1);
      const gapDays = followingDay
        ? (Date.parse(`${next.startDate}T00:00:00Z`) - Date.parse(`${followingDay}T00:00:00Z`)) / 86_400_000
        : 0;
      if (gapDays > 0) relations.push({ beforeTripId: previous.tripId, afterTripId: next.tripId, kind: "gap", days: gapDays });
    }
  }
  return relations;
}

function money(value: number, currency: SavedTrip["currency"]): string {
  return formatMoney(value, currency);
}

export function CombinedTripPlanner() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [groups, setGroups] = useState<SavedTripGroup[]>([]);
  const [selected, setSelected] = useState<SelectedTrip[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      await getPlannerDraftScope();
      const [savedTrips, savedGroups] = await Promise.all([listTrips(), listTripGroups()]);
      setTrips(savedTrips);
      setGroups(savedGroups);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron recuperar las planificaciones combinadas.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const dateRelations = analyzeTripGroupDates(selected);
  const addTrip = (tripId: string) => {
    if (selected.some((item) => item.tripId === tripId)) return;
    const trip = trips.find((entry) => entry.id === tripId);
    if (!trip) return;
    setSelected((items) => [...items, {
      tripId,
      trip,
      sortOrder: items.length + 1,
      startDate: trip.startDate,
      endDate: trip.endDate,
    }]);
  };
  const moveTrip = (index: number, delta: -1 | 1) => {
    setSelected((items) => {
      const target = index + delta;
      if (target < 0 || target >= items.length) return items;
      const result = [...items];
      [result[index], result[target]] = [result[target], result[index]];
      return result.map((item, order) => ({ ...item, sortOrder: order + 1 }));
    });
  };
  const updateDates = (tripId: string, key: "startDate" | "endDate", value: string) => {
    setSelected((items) => items.map((item) => item.tripId === tripId ? { ...item, [key]: value || null } : item));
  };
  const createGroup = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const group = await createTripGroup(name, selected.map(({ tripId, sortOrder }, index) => ({
        tripId,
        sortOrder: index + 1 || sortOrder,
        startDate: selected[index].startDate,
        endDate: selected[index].endDate,
      })));
      setGroups((current) => [group, ...current]);
      setSelected([]);
      setName("");
      setNotice(`Planificación «${group.name}» creada. Los viajes originales se mantienen sin cambios.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo crear la planificación combinada.");
    } finally {
      setSaving(false);
    }
  };

  const groupTrips = (group: SavedTripGroup) => group.items.flatMap((item) => {
    const trip = trips.find((entry) => entry.id === item.tripId);
    return trip ? [{ item, trip }] : [];
  });

  return (
    <section className="mt-10 space-y-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="combined-trip-title">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Planificación multiciudad</p>
        <h2 id="combined-trip-title" className="text-2xl font-bold sm:text-3xl">Viajes combinados</h2>
        <p className="mt-2 max-w-4xl text-base leading-relaxed text-slate-600">
          Agrupa viajes existentes en un resumen general sin fusionarlos ni duplicar sus gastos. Los importes se mantienen separados por moneda y los trayectos entre ciudades quedan pendientes de planificación.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{notice}</p>}
      {loading && <p className="text-sm text-slate-600">Cargando viajes guardados…</p>}

      {!loading && trips.length > 0 && (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
          <div className="rounded-2xl bg-slate-50 p-4">
            <label className="block text-sm font-semibold">Añadir viaje guardado
              <select value="" onChange={(event) => addTrip(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
                <option value="">Selecciona un viaje…</option>
                {trips.filter((trip) => !selected.some((item) => item.tripId === trip.id)).map((trip) => <option key={trip.id} value={trip.id}>{trip.name} · {trip.destination}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold">Nombre de la planificación
              <input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} placeholder="Por ejemplo, Ruta por Europa" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" />
            </label>
            <p className="mt-4 text-xs leading-relaxed text-slate-600">
              El orden, fechas y avisos se revisan antes de guardar. No se generan automáticamente vuelos, trenes, alojamientos ni precios de transporte.
            </p>
          </div>
          <div className="space-y-3">
            {selected.map((entry, index) => (
              <article key={entry.tripId} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destino {index + 1}</p>
                    <h3 className="text-lg font-semibold">{entry.trip.destination}</h3>
                    <p className="text-sm text-slate-600">{entry.trip.name} · {entry.trip.travelers} viajeros</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" aria-label={`Mover ${entry.trip.destination} arriba`} disabled={index === 0} onClick={() => moveTrip(index, -1)} className="min-h-10 min-w-10 rounded-lg border disabled:opacity-40">↑</button>
                    <button type="button" aria-label={`Mover ${entry.trip.destination} abajo`} disabled={index === selected.length - 1} onClick={() => moveTrip(index, 1)} className="min-h-10 min-w-10 rounded-lg border disabled:opacity-40">↓</button>
                    <button type="button" onClick={() => setSelected((items) => items.filter((item) => item.tripId !== entry.tripId).map((item, order) => ({ ...item, sortOrder: order + 1 })))} className="min-h-10 rounded-lg border border-red-200 px-3 text-sm text-red-700">Quitar</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-700">Inicio planificado
                    <input type="date" value={entry.startDate ?? ""} onChange={(event) => updateDates(entry.tripId, "startDate", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
                  </label>
                  <label className="text-sm text-slate-700">Fin planificado
                    <input type="date" value={entry.endDate ?? ""} onChange={(event) => updateDates(entry.tripId, "endDate", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
                  </label>
                </div>
              </article>
            ))}
            {selected.length > 0 && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <h3 className="font-semibold text-sky-950">Revisión previa</h3>
                <ul className="mt-2 space-y-1 text-sm text-sky-950">
                  {dateRelations.map((relation) => {
                    const previous = selected.find((item) => item.tripId === relation.beforeTripId);
                    const next = selected.find((item) => item.tripId === relation.afterTripId);
                    return <li key={`${relation.beforeTripId}-${relation.afterTripId}`}>
                      {relation.kind === "overlap"
                        ? `Solapamiento de ${relation.days} día(s): ${previous?.trip.destination} / ${next?.trip.destination}. Ajusta las fechas o confirma sabiendo que coinciden.`
                        : `Hueco de ${relation.days} día(s) entre ${previous?.trip.destination} y ${next?.trip.destination}; el desplazamiento queda pendiente de planificar.`}
                    </li>;
                  })}
                  {dateRelations.length === 0 && <li>No hay solapamientos ni huecos entre los periodos consecutivos que tienen fechas.</li>}
                </ul>
                <p className="mt-2 text-sm text-sky-950">Transporte entre destinos: pendiente de planificación; no se infieren medios, horarios ni costes.</p>
                <button type="button" disabled={saving || !name.trim() || selected.length === 0}
                  onClick={() => void createGroup()} className="mt-4 min-h-11 rounded-xl bg-sky-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Guardando…" : "Confirmar y guardar planificación"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && trips.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Guarda viajes antes de agruparlos.</p>}

      {groups.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Planificaciones guardadas</h3>
          {groups.map((group) => {
            const items = groupTrips(group);
            const currencies = [...new Set(items.map(({ trip }) => trip.currency))];
            return <article key={group.id} className="rounded-2xl border border-slate-200 p-4">
              <h4 className="text-lg font-semibold">{group.name}</h4>
              <ol className="mt-3 space-y-2">
                {items.map(({ item, trip }, index) => (
                  <li key={trip.id} className="rounded-xl bg-slate-50 p-3">
                    <p className="font-medium">{index + 1}. {trip.destination} · {formatIsoDate(item.startDate)} – {formatIsoDate(item.endDate)}</p>
                    <p className="text-sm text-slate-600">{trip.name} · transporte entre destinos pendiente de planificación</p>
                  </li>
                ))}
              </ol>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {currencies.map((currency) => {
                  const currencyTrips = items.filter(({ trip }) => trip.currency === currency);
                  const budget = sumAmountsInMinorUnits(currencyTrips.map(({ trip }) => trip.budget), currency);
                  const summaries = currencyTrips.map(({ trip }) => getTripBudgetSummary(trip));
                  const actual = sumAmountsInMinorUnits(summaries.map((summary) => summary.actualExpenses), currency);
                  const estimated = sumAmountsInMinorUnits(summaries.map((summary) => summary.totalEstimated), currency);
                  return <div key={currency} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <dt className="font-semibold">{currency} · presupuesto {money(budget, currency)}</dt>
                    <dd>Gastos {money(actual, currency)} · estimado pendiente {money(estimated, currency)}</dd>
                  </div>;
                })}
              </dl>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
