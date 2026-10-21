"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIsoDate } from "@/lib/date-format";
import { listTrips } from "@/lib/persistence/client";
import type { SavedTrip } from "@/lib/persistence/types";
import { getTripMapActivities } from "@/lib/trip-map";
import type { TripMapPoint } from "@/features/map/components/trip-map-view";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";

const TripMapView = dynamic(
  () => import("@/features/map/components/trip-map-view").then((module) => module.TripMapView),
  { ssr: false, loading: () => <div className="h-[55vh] min-h-80 animate-pulse rounded-2xl bg-slate-100" aria-label="Cargando mapa" /> },
);

export function TripMapClient() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("all");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      await getPlannerDraftScope();
      const savedTrips = await listTrips();
      setTrips(savedTrips);
      setSelectedTripId((current) => current || savedTrips[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los viajes.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId);
  const selectedDay = selectedTrip?.itinerary.find((day) => day.id === selectedDayId);
  const selectedActivities = useMemo(
    () => selectedTrip ? getTripMapActivities(selectedTrip, selectedDay) : [],
    [selectedDay, selectedTrip],
  );
  const points = useMemo<TripMapPoint[]>(
    () => selectedActivities.flatMap((activity) => activity.hasCoordinates && activity.lat !== undefined && activity.lng !== undefined
      ? [{
          id: activity.id,
          name: activity.name,
          description: activity.description,
          ...(activity.location ? { location: activity.location } : {}),
          date: activity.date,
          ...(activity.startTime ? { startTime: activity.startTime } : {}),
          ...(activity.endTime ? { endTime: activity.endTime } : {}),
          durationMinutes: activity.durationMinutes,
          lat: activity.lat,
          lng: activity.lng,
          ...(activity.reliability ? { reliability: activity.reliability } : {}),
        }]
      : []),
    [selectedActivities],
  );

  const activePointId = points.some((point) => point.id === selectedPointId) ? selectedPointId : null;

  return (
    <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.4fr)]">
      <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="text-sm font-semibold">Viaje
            <select value={selectedTripId} onChange={(event) => { setSelectedTripId(event.target.value); setSelectedDayId("all"); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3">
              {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name} · {trip.destination}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Jornada
            <select value={selectedDayId} onChange={(event) => setSelectedDayId(event.target.value)} disabled={!selectedTrip} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 disabled:bg-slate-100">
              <option value="all">Todas las jornadas</option>
              {selectedTrip?.itinerary.map((day) => <option key={day.id} value={day.id}>Día {day.dayNumber}{day.date ? ` · ${formatIsoDate(day.date)}` : ""}</option>)}
            </select>
          </label>
        </div>
        <h2 className="mt-5 text-lg font-semibold">Actividades de la selección</h2>
        {loading && <p className="mt-3 text-sm text-slate-600" role="status">Cargando viajes…</p>}
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
        {!loading && trips.length === 0 && <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No hay viajes guardados para mostrar.</p>}
        {!loading && trips.length > 0 && points.length === 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Ninguna actividad de esta selección tiene coordenadas válidas. Se mantienen en la lista y el mapa no inventa ubicaciones.</p>
        )}
        <ol className="mt-3 space-y-2">
          {selectedActivities.map((activity, index) => (
            <li key={activity.id}>
              <button type="button" disabled={!activity.hasCoordinates} aria-pressed={selectedPointId === activity.id}
                onClick={() => setSelectedPointId(activity.id)}
                className={`w-full rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:bg-slate-50 ${
                  activePointId === activity.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                }`}>
                <span className="flex items-start gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${activity.hasCoordinates ? "bg-slate-900" : "bg-slate-400"}`}>{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{activity.startTime ? `${activity.startTime}–${activity.endTime ?? ""} · ` : ""}{activity.name}</span>
                    <span className="block text-sm text-slate-600">{activity.location ?? "Lugar sin descripción de zona"} · {activity.durationMinutes} min</span>
                    <span className="block text-xs text-slate-500">{activity.date ? formatIsoDate(activity.date) : "Fecha no disponible"} · fiabilidad: {activity.reliability ?? "no indicada"}</span>
                    {!activity.hasCoordinates && <span className="mt-1 block text-xs font-semibold text-amber-800">Ubicación no disponible</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        {selectedTrip && (
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Las coordenadas proceden del itinerario guardado y pueden no estar verificadas. El mapa no calcula rutas por calles ni tiempos de trayecto.
          </p>
        )}
      </div>
      <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 sm:p-3">
        <TripMapView points={points} selectedId={activePointId} onSelect={setSelectedPointId} />
        <p className="px-2 py-2 text-xs text-slate-500">
          Cartografía © OpenStreetMap contributors. La disponibilidad de teselas está sujeta a las políticas de uso de OpenStreetMap.
          {" "}<a className="underline" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Reportar un problema del mapa</a>
        </p>
      </div>
    </section>
  );
}
