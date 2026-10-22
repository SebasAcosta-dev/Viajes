"use client";

import { useState } from "react";
import type { ActivityAlternative } from "@/lib/ai";
import type { ItineraryItem } from "@/lib/types";

export type ActivityAssistantContext = {
  destination?: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  interests?: string[];
  travelers?: number;
  budget?: number;
  currency?: ItineraryItem["currency"];
  pace?: string;
  travelType?: string;
};

export function ActivityAssistant({ activity, context, onApplyAlternative }: {
  activity: ItineraryItem;
  context: ActivityAssistantContext;
  onApplyAlternative: (alternative: ActivityAlternative) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"openrouter" | "demo" | null>(null);
  const [alternatives, setAlternatives] = useState<ActivityAlternative[]>([]);
  const [selectedAlternative, setSelectedAlternative] = useState<ActivityAlternative | null>(null);

  const ask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true); setError(""); setText(""); setAlternatives([]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt.trim(),
          context: { ...context, activity: {
            name: activity.name, description: activity.description, location: activity.location,
            startTime: activity.startTime, endTime: activity.endTime, durationMinutes: activity.durationMinutes,
          } },
        }),
      });
      const result: unknown = await response.json();
      if (!result || typeof result !== "object") throw new Error("El asistente devolvió una respuesta no válida.");
      if (!response.ok) throw new Error("error" in result && typeof result.error === "string" ? result.error : "No se pudo consultar al asistente.");
      const reply = result as { text?: unknown; source?: unknown; activityAlternatives?: unknown };
      setText(typeof reply.text === "string" ? reply.text : "");
      setSource(reply.source === "openrouter" || reply.source === "demo" ? reply.source : null);
      if (Array.isArray(reply.activityAlternatives)) setAlternatives(reply.activityAlternatives.filter((value): value is ActivityAlternative =>
        Boolean(value && typeof value === "object" && "name" in value && typeof value.name === "string"
          && "description" in value && typeof value.description === "string"
          && "durationMinutes" in value && typeof value.durationMinutes === "number"),
      ));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo consultar al asistente.");
    } finally { setLoading(false); }
  };

  return <div className="mt-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="min-h-9 rounded-lg border border-emerald-200 px-3 text-xs font-medium text-emerald-800">{open ? "Cerrar asistente IA" : "Consultar al asistente IA"}</button>
    {open && <section aria-label={`Asistente IA para ${activity.name}`} className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <p className="text-sm font-semibold">{activity.name} · {context.destination ?? "Destino"}</p>
      <p className="text-xs text-slate-600">{activity.startTime ?? "Horario sin definir"}{activity.endTime ? `–${activity.endTime}` : ""} · {activity.durationMinutes} min{activity.location ? ` · ${activity.location}` : ""}</p>
      <div className="mt-2 flex flex-wrap gap-2">{["Recomiéndame otras tres actividades", "Busca una alternativa gratuita", "Sugiere algo parecido cerca de aquí", "Quiero una visita más corta", "Propón una alternativa para este horario"].map((suggestion) => <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="rounded-full border bg-white px-3 py-1.5 text-xs">{suggestion}</button>)}</div>
      <form onSubmit={(event) => void ask(event)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><label className="sr-only" htmlFor={`activity-ai-${activity.id}`}>Tu petición para el asistente</label><textarea id={`activity-ai-${activity.id}`} required maxLength={2000} rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="¿Qué alternativa buscas?" /><button type="submit" disabled={loading || !prompt.trim()} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Consultando…" : "Enviar"}</button></form>
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}{loading && <p role="status" className="mt-2 text-sm">Buscando alternativas…</p>}
      {text && <div aria-live="polite" className="mt-2 rounded-lg bg-white p-3 text-sm">{text}{source === "demo" && <p className="mt-1 text-xs text-amber-800">Modo demo: estas recomendaciones no son verificables.</p>}</div>}
      {alternatives.length > 0 && <ul className="mt-2 space-y-2">{alternatives.map((alternative, index) => <li key={`${alternative.name}-${index}`} className="rounded-lg border bg-white p-3"><p className="font-semibold">{alternative.name}</p><p className="text-sm text-slate-600">{alternative.description}</p><p className="text-xs text-slate-500">{alternative.durationMinutes} min{alternative.location ? ` · ${alternative.location}` : ""}</p><button type="button" onClick={() => setSelectedAlternative(alternative)} className="mt-2 min-h-9 rounded-lg border border-emerald-300 px-3 text-xs font-semibold text-emerald-800">Comparar alternativa</button></li>)}</ul>}
      {selectedAlternative && <div className="mt-3 rounded-lg border border-amber-300 bg-white p-3" role="group" aria-label="Confirmar sustitución de actividad">
        <p className="text-sm">Actual: <strong>{activity.name}</strong> · {activity.durationMinutes} min</p><p className="text-sm">Propuesta: <strong>{selectedAlternative.name}</strong> · {selectedAlternative.durationMinutes} min</p>
        <div className="mt-2 flex gap-2"><button type="button" onClick={() => { onApplyAlternative(selectedAlternative); setSelectedAlternative(null); }} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white">Proponer sustitución</button><button type="button" onClick={() => setSelectedAlternative(null)} className="min-h-10 rounded-lg border px-3 text-sm">Cancelar</button></div>
      </div>}
    </section>}
  </div>;
}
