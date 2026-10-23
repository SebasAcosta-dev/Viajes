"use client";

import { useState, type FormEvent } from "react";
import { calculateScheduledEnd, durationBetween, getBlockTypeLabel } from "@/lib/itinerary-schedule";
import type { ItineraryItem } from "@/lib/types";

export function getActivityCategoryClasses(item: ItineraryItem): string {
  switch (item.blockType) {
    case "breakfast": case "lunch": case "dinner": return "border-amber-200 bg-amber-50";
    case "travel": return "border-slate-300 bg-slate-100";
    case "rest": case "free_time": return "border-violet-200 bg-violet-50";
    case "activity": return /museum|museo|cultur|arte|arquitect|histori/i.test(`${item.name} ${item.description}`)
      ? "border-sky-200 bg-sky-50"
      : /parque|playa|natur|sender|jard[ií]n/i.test(`${item.name} ${item.description}`)
        ? "border-emerald-200 bg-emerald-50"
        : /noche|nocturn|ocio|concierto|bar/i.test(`${item.name} ${item.description}`)
          ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white";
    default: return "border-slate-200 bg-white";
  }
}

export function ActivityEditor({
  activity,
  travelers,
  initiallyEditing = false,
  onSave,
}: {
  activity: ItineraryItem;
  travelers: number;
  initiallyEditing?: boolean;
  onSave: (activity: ItineraryItem) => void | boolean | Promise<void | boolean>;
}) {
  const [editing, setEditing] = useState(initiallyEditing);
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description);
  const [duration, setDuration] = useState(String(activity.durationMinutes));
  const [startTime, setStartTime] = useState(activity.startTime ?? "");
  const [endTime, setEndTime] = useState(activity.endTime ?? (activity.startTime ? calculateScheduledEnd(activity.startTime, activity.durationMinutes) ?? "" : ""));
  const [location, setLocation] = useState(activity.location ?? "");
  const [blockType, setBlockType] = useState<NonNullable<ItineraryItem["blockType"]>>(activity.blockType ?? "activity");
  const [latitude, setLatitude] = useState(activity.lat?.toString() ?? "");
  const [longitude, setLongitude] = useState(activity.lng?.toString() ?? "");
  const [pricePerPerson, setPricePerPerson] = useState(activity.pricePerPerson?.toString() ?? (activity.estimate !== undefined && travelers ? (activity.estimate / travelers).toFixed(2) : ""));
  const [priceStatus, setPriceStatus] = useState<NonNullable<ItineraryItem["priceStatus"]>>(activity.priceStatus ?? "unknown");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = Number(duration);
    const hasAnyTime = Boolean(startTime || endTime);
    const synchronizedDuration = hasAnyTime ? durationBetween(startTime, endTime) : undefined;
    const perPerson = pricePerPerson.trim() ? Number(pricePerPerson) : undefined;
    const lat = latitude.trim() ? Number(latitude) : undefined;
    const lng = longitude.trim() ? Number(longitude) : undefined;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1439 || (hasAnyTime && (!synchronizedDuration || synchronizedDuration !== minutes))) {
      setError("Revisa el horario y la duración: el fin debe ser posterior al inicio y coincidir con los minutos indicados.");
      return;
    }
    if (Boolean(latitude.trim()) !== Boolean(longitude.trim()) || (lat !== undefined && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lng !== undefined && (!Number.isFinite(lng) || lng < -180 || lng > 180))) {
      setError("Indica coordenadas válidas de latitud y longitud, o deja ambos campos vacíos.");
      return;
    }
    if ((priceStatus === "estimate" || priceStatus === "verified") && (perPerson === undefined || !Number.isFinite(perPerson) || perPerson <= 0)) {
      setError("Indica un precio positivo o selecciona precio no disponible o gratuito verificado.");
      return;
    }
    const updated: ItineraryItem = {
      ...activity, name: name.trim(), description: description.trim(), durationMinutes: synchronizedDuration ?? minutes,
      startTime: startTime || undefined, endTime: endTime || undefined, location: location.trim() || undefined, blockType,
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : { lat: undefined, lng: undefined }),
      ...(priceStatus === "free_verified" ? { pricePerPerson: undefined, estimate: 0, priceStatus }
        : priceStatus === "unknown" ? { pricePerPerson: undefined, estimate: undefined, priceStatus }
          : { pricePerPerson: perPerson, estimate: perPerson === undefined ? undefined : Number((perPerson * travelers).toFixed(2)), priceStatus }),
    };
    setSaving(true);
    setError("");
    try {
      const saved = await onSave(updated);
      if (saved !== false) setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la actividad.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) return <button type="button" onClick={() => setEditing(true)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Editar actividad</button>;
  return <form onSubmit={(event) => void submit(event)} className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
    <label className="text-xs text-slate-600">Nombre<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2" /></label>
    <label className="text-xs text-slate-600">Tipo de bloque<select value={blockType} onChange={(event) => setBlockType(event.target.value as NonNullable<ItineraryItem["blockType"]>)} className="mt-1 min-h-10 w-full rounded-lg border px-2">{(["activity", "travel", "breakfast", "lunch", "dinner", "rest", "free_time"] as const).map((type) => <option key={type} value={type}>{getBlockTypeLabel(type)}</option>)}</select></label>
    <label className="text-xs text-slate-600">Hora de inicio<input type="time" value={startTime} onChange={(event) => { const value = event.target.value; setStartTime(value); if (!value) { setEndTime(""); return; } const end = calculateScheduledEnd(value, Number(duration)); if (end) setEndTime(end); }} className="mt-1 min-h-10 w-full rounded-lg border px-2" /></label>
    <label className="text-xs text-slate-600">Hora de finalización<input type="time" value={endTime} onChange={(event) => { const value = event.target.value; setEndTime(value); const next = durationBetween(startTime, value); if (next) setDuration(String(next)); }} className="mt-1 min-h-10 w-full rounded-lg border px-2" /></label>
    <label className="text-xs text-slate-600">Duración (minutos)<input required type="number" min={1} max={1439} value={duration} onChange={(event) => { const value = event.target.value; setDuration(value); const end = calculateScheduledEnd(startTime, Number(value)); if (end) setEndTime(end); }} className="mt-1 min-h-10 w-full rounded-lg border px-2" /></label>
    <label className="text-xs text-slate-600">Ubicación<input maxLength={240} value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2" /></label>
    <label className="text-xs text-slate-600 sm:col-span-2">Descripción<textarea maxLength={2000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border px-2 py-2" /></label>
    <label className="text-xs text-slate-600">Latitud<input type="number" min={-90} max={90} step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2" /></label>
    <label className="text-xs text-slate-600">Longitud<input type="number" min={-180} max={180} step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2" /></label>
    <label className="text-xs text-slate-600">Estado del precio<select value={priceStatus} onChange={(event) => setPriceStatus(event.target.value as NonNullable<ItineraryItem["priceStatus"]>)} className="mt-1 min-h-10 w-full rounded-lg border px-2"><option value="verified">Verificado</option><option value="estimate">Estimado</option><option value="unknown">No disponible</option><option value="free_verified">Gratuito verificado</option></select></label>
    <label className="text-xs text-slate-600">Precio por persona ({activity.currency})<input type="number" min={0.01} step="0.01" disabled={priceStatus === "unknown" || priceStatus === "free_verified"} value={pricePerPerson} onChange={(event) => setPricePerPerson(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 disabled:bg-slate-100" /></label>
    {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
    <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar actividad"}</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className="min-h-10 rounded-lg border px-3 text-sm">Cancelar</button></div>
  </form>;
}
