"use client";

import { useState, type FormEvent } from "react";
import { calculateScheduledEnd, durationBetween, getBlockTypeLabel } from "@/lib/itinerary-schedule";
import type { ItineraryItem } from "@/lib/types";

export function ActivityCreateForm({ currency, suggestedStart, existingItems, confirmOverlaps = false, onSave, onCancel }: {
  currency: ItineraryItem["currency"];
  suggestedStart: string;
  existingItems: ItineraryItem[];
  confirmOverlaps?: boolean;
  onSave: (activity: ItineraryItem) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [blockType, setBlockType] = useState<NonNullable<ItineraryItem["blockType"]>>("activity");
  const [startTime, setStartTime] = useState(suggestedStart);
  const [duration, setDuration] = useState(60);
  const [endTime, setEndTime] = useState(calculateScheduledEnd(suggestedStart, 60) ?? "10:00");
  const [overlapAcknowledged, setOverlapAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const matchedDuration = durationBetween(startTime, endTime);
    if (!name.trim()) { setError("Indica el nombre de la actividad."); return; }
    if (!matchedDuration || matchedDuration !== duration) { setError("La hora final debe ser posterior al inicio y coincidir con la duración."); return; }
    const conflicts = existingItems.filter((item) => item.startTime && item.endTime && startTime < item.endTime && item.startTime < endTime);
    if (confirmOverlaps && conflicts.length && !overlapAcknowledged) {
      setError(`El horario se solapa con ${conflicts.map((item) => item.name).join(", ")}. Ajusta las horas o vuelve a guardar para conservar el solapamiento.`);
      setOverlapAcknowledged(true);
      return;
    }
    setSaving(true); setError("");
    const activity: ItineraryItem = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: name.trim(), description: description.trim(), location: location.trim() || undefined,
      blockType, startTime, endTime, durationMinutes: matchedDuration, priceStatus: "unknown",
      budgetCategory: "activity", currency, order: existingItems.length + 1, notes: "", source: "desconocido",
    };
    try { await onSave(activity); onCancel(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la actividad."); }
    finally { setSaving(false); }
  };

  return <form onSubmit={(event) => void submit(event)} className="mt-3 grid gap-3 rounded-xl border border-emerald-200 bg-white p-3 sm:grid-cols-2">
    <label className="text-xs text-slate-600">Nombre<input autoFocus required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-sm" /></label>
    <label className="text-xs text-slate-600">Tipo de bloque<select value={blockType} onChange={(event) => setBlockType(event.target.value as NonNullable<ItineraryItem["blockType"]>)} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-sm">{(["activity", "travel", "breakfast", "lunch", "dinner", "rest", "free_time"] as const).map((type) => <option key={type} value={type}>{getBlockTypeLabel(type)}</option>)}</select></label>
    <label className="text-xs text-slate-600">Hora de inicio<input required type="time" value={startTime} onChange={(event) => { const value = event.target.value; setStartTime(value); setOverlapAcknowledged(false); setEndTime(calculateScheduledEnd(value, duration) ?? endTime); }} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-sm" /></label>
    <label className="text-xs text-slate-600">Hora de finalización<input required type="time" value={endTime} onChange={(event) => { const value = event.target.value; setEndTime(value); setOverlapAcknowledged(false); setDuration(durationBetween(startTime, value) ?? duration); }} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-sm" /></label>
    <label className="text-xs text-slate-600">Duración (minutos)<input required type="number" min={1} max={1439} value={duration} onChange={(event) => { const value = Number(event.target.value); setDuration(value); setOverlapAcknowledged(false); setEndTime(calculateScheduledEnd(startTime, value) ?? endTime); }} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-sm" /></label>
    <label className="text-xs text-slate-600">Ubicación (opcional)<input maxLength={240} value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-sm" /></label>
    <label className="text-xs text-slate-600 sm:col-span-2">Descripción (opcional)<textarea maxLength={2000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
    {error && <p role="alert" className="text-sm text-red-800 sm:col-span-2">{error}</p>}
    <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : overlapAcknowledged ? "Guardar con solapamiento" : "Guardar actividad"}</button><button type="button" disabled={saving} onClick={onCancel} className="min-h-10 rounded-lg border px-4 text-sm">Cancelar</button></div>
  </form>;
}
