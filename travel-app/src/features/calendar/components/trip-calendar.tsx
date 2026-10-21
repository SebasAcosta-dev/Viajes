"use client";

import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getCalendarEntries, getMonthDates, getWeekDates } from "@/lib/calendar";
import { formatIsoDate } from "@/lib/date-format";
import { listTrips } from "@/lib/persistence/client";
import type { SavedTrip } from "@/lib/persistence/types";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";

type CalendarView = "month" | "week" | "agenda";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function subscribeToDateChanges(): () => void {
  return () => {};
}

function shiftMonth(value: string, amount: number): string {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftWeek(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount * 7);
  return date.toISOString().slice(0, 10);
}

function monthTitle(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function TripCalendar({
  trips: suppliedTrips,
  embedded = false,
  hasError = false,
}: {
  trips?: SavedTrip[];
  embedded?: boolean;
  hasError?: boolean;
}) {
  const today = useSyncExternalStore(subscribeToDateChanges, todayIso, () => "1970-01-01");
  const [loadedTrips, setLoadedTrips] = useState<SavedTrip[]>([]);
  const [view, setView] = useState<CalendarView>("month");
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null);
  const selectedDate = selectedDateOverride ?? today;
  const [loading, setLoading] = useState(suppliedTrips === undefined);
  const [error, setError] = useState("");
  const trips = suppliedTrips ?? loadedTrips;

  const refresh = useCallback(async () => {
    setError("");
    try {
      await getPlannerDraftScope();
      setLoadedTrips(await listTrips());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los viajes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (suppliedTrips !== undefined) return;
    void Promise.resolve().then(refresh);
  }, [refresh, suppliedTrips]);

  const entries = useMemo(() => getCalendarEntries(trips), [trips]);
  const visibleDates = useMemo(() => {
    if (view === "month") return getMonthDates(selectedDate.slice(0, 7));
    if (view === "week") return getWeekDates(selectedDate);
    return [];
  }, [selectedDate, view]);
  const agendaEntries = entries.filter((entry) => entry.date >= selectedDate);
  const monthEntries = entries.filter((entry) => entry.date.startsWith(selectedDate.slice(0, 7)));
  const compactMonthDates = [...new Set(monthEntries.map((entry) => entry.date))];

  const moveDate = (direction: number) => {
    setSelectedDateOverride(view === "month"
      ? `${shiftMonth(selectedDate.slice(0, 7), direction)}-01`
      : shiftWeek(selectedDate, direction));
  };

  return (
    <section className="calendar-panel min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label="Calendario de viajes">
      {!embedded && (
        <PageHeading eyebrow="Organización" title="Calendario de viajes" description="Reúne los periodos y las actividades guardadas; los itinerarios antiguos aparecen sin horas asignadas."
          actions={<Link href="/viajes" className="min-h-11 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Gestionar viajes</Link>} />
      )}
      {embedded && <p className="mb-4 text-sm text-slate-600">Vista mensual, semanal o agenda de tus viajes y actividades guardadas.</p>}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Vista de calendario">
          {([
            ["month", "Mes"],
            ["week", "Semana"],
            ["agenda", "Agenda"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}
              className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${view === value ? "bg-emerald-700 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== "agenda" && (
            <>
              <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm" aria-label="Periodo anterior" onClick={() => moveDate(-1)}>←</button>
              <p className="min-w-40 text-center font-semibold capitalize">
                {view === "month" ? monthTitle(selectedDate.slice(0, 7)) : `${formatIsoDate(visibleDates[0])} – ${formatIsoDate(visibleDates[6])}`}
              </p>
              <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm" aria-label="Periodo siguiente" onClick={() => moveDate(1)}>→</button>
            </>
          )}
          <button type="button" className="min-h-11 rounded-xl border border-emerald-700 px-4 text-sm font-semibold text-emerald-800" onClick={() => setSelectedDateOverride(null)}>Hoy</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      {loading && <p className="py-8 text-center text-slate-600" role="status">Cargando viajes…</p>}
      {!loading && trips.length === 0 && !error && !hasError && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="font-semibold">Todavía no hay viajes guardados.</p>
          <Link className="mt-3 inline-block text-emerald-800 underline" href="/planificar">Crear viaje</Link>
        </div>
      )}
      {!loading && trips.length > 0 && view === "month" && (
        <>
          <div className="hidden grid-cols-7 gap-2 text-center text-sm font-semibold text-slate-600 sm:grid">
            {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((day) => <div key={day} className="py-2">{day}</div>)}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <div className="grid min-w-[56rem] grid-cols-7 gap-2">
              {visibleDates.map((date) => {
                const dayEntries = entries.filter((entry) => entry.date === date);
                const inMonth = date.startsWith(selectedDate.slice(0, 7));
                const overlappingTrips = dayEntries.filter((entry) => entry.kind === "trip").length > 1;
                return (
                  <section key={date} className={`min-h-28 rounded-xl border p-2 ${inMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
                    <button type="button" onClick={() => { setSelectedDateOverride(date); setView("agenda"); }}
                      className="mb-1 min-h-8 rounded-full px-2 text-sm font-semibold hover:bg-slate-100" aria-label={`Ver ${formatIsoDate(date)}`}>
                      {formatIsoDate(date)}
                    </button>
                    {overlappingTrips && <p className="px-2 text-xs font-semibold text-amber-800">Viajes solapados</p>}
                    <div className="space-y-1">
                      {dayEntries.slice(0, 3).map((entry, index) => (
                        <Link key={`${entry.href}-${entry.kind}-${index}`} href={entry.href}
                          className={`block truncate rounded-md px-2 py-1 text-xs ${entry.kind === "trip" ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-900"}`}>
                          {entry.startTime ? `${entry.startTime} · ` : ""}{entry.label}
                        </Link>
                      ))}
                      {dayEntries.length > 3 && <p className="px-2 text-xs text-slate-500">+{dayEntries.length - 3} más</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          <div className="space-y-3 sm:hidden">
            {compactMonthDates.length > 0 ? compactMonthDates.map((date) => (
              <section key={date} className="rounded-xl border border-slate-200 p-3">
                <h3 className="mb-2 font-semibold">{formatIsoDate(date)}</h3>
                <ul className="space-y-2">
                  {monthEntries.filter((entry) => entry.date === date).map((entry, index) => (
                    <li key={`${entry.href}-${entry.kind}-${index}`}>
                      <Link href={entry.href} className="block rounded-lg bg-slate-50 p-3 text-sm">
                        {entry.startTime && <span className="mr-1 font-semibold tabular-nums">{entry.startTime} ·</span>}{entry.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No hay viajes ni actividades este mes.</p>}
          </div>
        </>
      )}
      {!loading && trips.length > 0 && view === "week" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {visibleDates.map((date) => (
            <section key={date} className={`min-h-40 rounded-2xl border p-3 ${date === selectedDate ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200"}`}>
              <button type="button" className="min-h-10 font-semibold underline-offset-2 hover:underline" onClick={() => setSelectedDateOverride(date)}>{formatIsoDate(date)}</button>
              <div className="mt-3 space-y-2">
                {entries.filter((entry) => entry.date === date).map((entry, index) => (
                  <Link key={`${entry.href}-${entry.kind}-${index}`} href={entry.href} className="block rounded-lg bg-white p-2 text-sm shadow-sm">
                    {entry.startTime && <span className="mr-1 font-semibold tabular-nums">{entry.startTime}</span>}{entry.label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {!loading && trips.length > 0 && view === "agenda" && (
        <div className="space-y-5">
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium">Mostrar desde
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDateOverride(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-3" />
          </label>
          {agendaEntries.length > 0 ? (
            <ol className="space-y-3">
              {agendaEntries.slice(0, 100).map((entry, index) => (
                <li key={`${entry.href}-${entry.kind}-${index}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <time className="min-w-32 font-semibold tabular-nums">{formatIsoDate(entry.date)}{entry.startTime ? ` · ${entry.startTime}` : ""}</time>
                  <Link href={entry.href} className="min-w-0 flex-1 underline decoration-slate-300 underline-offset-2">{entry.label}</Link>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{entry.kind === "trip" ? "Viaje" : "Actividad"}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-slate-600">No hay viajes ni actividades en esta fecha o después.</div>
          )}
        </div>
      )}
    </section>
  );
}
