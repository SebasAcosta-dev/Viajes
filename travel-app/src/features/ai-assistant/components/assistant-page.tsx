"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Currency } from "@/lib/types";
import type { ItineraryPlan } from "@/lib/ai";
import { SaveTripButton } from "@/features/trips/components/save-trip-button";
import { addIsoDays, formatIsoDate, formatTripPeriod } from "@/lib/date-format";
import { getBlockTypeLabel } from "@/lib/itinerary-schedule";
import { normalizeNewDateRange } from "@/lib/trip-dates";
import { useLocalToday } from "@/lib/hooks/use-local-today";

const defaultPrompt = "Organiza un viaje barato a Marrakech de cuatro días.";

function formatEstimate(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function IaPage() {
  const today = useLocalToday();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [answer, setAnswer] = useState(
    "Puedo ayudarte con un enfoque equilibrado: zocos, palacios, buen precio y tiempo para descansar. Recomiendo priorizar la medina, gastronomía y rutas compactas para reducir desplazamientos.",
  );
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("demo");
  const [warning, setWarning] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryPlan | null>(null);
  const [tripDetails, setTripDetails] = useState({
    startDate: "",
    endDate: "",
    travelers: "",
    budget: "",
    currency: "EUR" as Currency,
  });
  const updateTripDate = (key: "startDate" | "endDate", value: string) => {
    setTripDetails((current) => ({
      ...current,
      ...normalizeNewDateRange(
        key === "startDate" ? value : current.startDate,
        key === "endDate" ? value : current.endDate,
        today,
      ),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setWarning(null);
    setItinerary(null);

    try {
      const normalizedDates = normalizeNewDateRange(tripDetails.startDate, tripDetails.endDate, today);
      if (normalizedDates.startDate !== tripDetails.startDate || normalizedDates.endDate !== tripDetails.endDate) {
        setTripDetails((current) => ({ ...current, ...normalizedDates }));
      }
      const requestedDetails = { ...tripDetails, ...normalizedDates };
      if (Boolean(requestedDetails.startDate) !== Boolean(requestedDetails.endDate)) {
        throw new Error("Indica las dos fechas del viaje o deja ambas vacías.");
      }
      if (requestedDetails.startDate && requestedDetails.endDate && requestedDetails.endDate < requestedDetails.startDate) {
        throw new Error("La fecha de regreso no puede ser anterior a la salida.");
      }
      if (requestedDetails.startDate && requestedDetails.endDate &&
        (Date.parse(`${requestedDetails.endDate}T00:00:00Z`) - Date.parse(`${requestedDetails.startDate}T00:00:00Z`)) / 86_400_000 >= 30) {
        throw new Error("El itinerario admite hasta 30 días.");
      }
      const travelers = tripDetails.travelers ? Number(tripDetails.travelers) : undefined;
      const budget = tripDetails.budget ? Number(tripDetails.budget) : undefined;
      if (travelers !== undefined && (!Number.isInteger(travelers) || travelers < 1 || travelers > 100)) {
        throw new Error("El número de viajeros debe ser un entero entre 1 y 100.");
      }
      if (budget !== undefined && (!Number.isFinite(budget) || budget < 0)) {
        throw new Error("El presupuesto debe ser un importe no negativo.");
      }
      const context = {
        ...(requestedDetails.startDate ? { startDate: requestedDetails.startDate, endDate: requestedDetails.endDate } : {}),
        ...(travelers !== undefined ? { travelers } : {}),
        ...(budget !== undefined ? { budget, currency: tripDetails.currency } : {}),
      };
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Time-Zone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
        body: JSON.stringify({ message: prompt, context }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(typeof data.error === "string" ? data.error : "La respuesta del asistente no está disponible.");
      }

      const data = await response.json();
      setAnswer(data.text ?? "No hay respuesta disponible.");
      setSource(data.source ?? "demo");
      setWarning(typeof data.warning === "string" ? data.warning : null);
      setItinerary(data.itinerary ?? null);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "No se pudo contactar con el asistente.");
      setSource("error");
      setWarning(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Asistente IA</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Chat de viajes</h1>
        </div>
        <Link href="/" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Inicio</Link>
      </div>

      <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
        <p className="mb-5 max-w-5xl text-base leading-relaxed text-slate-600">
          El asistente usa MiniMax a través de OpenRouter cuando está activado el modo production. En modo demo responde sin llamar a servicios externos.
        </p>

        <form onSubmit={handleSubmit} className="grid min-w-0 gap-4 md:grid-cols-2">
          <label className="block text-base font-medium text-slate-700 md:col-span-2">
            Solicitud del usuario
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              required
              maxLength={2000}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base leading-relaxed text-slate-700 outline-none ring-0 transition focus:border-emerald-500"
            />
          </label>
          <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2 md:col-span-2 lg:grid-cols-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Datos del viaje (opcionales)</legend>
            <label className="text-xs text-slate-600">Salida
              <input type="date" min={today} value={tripDetails.startDate} onChange={(event) => updateTripDate("startDate", event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-600">Regreso
              <input type="date" min={tripDetails.startDate || today} value={tripDetails.endDate} onChange={(event) => updateTripDate("endDate", event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-600">Viajeros
              <input type="number" min={1} max={100} step={1} value={tripDetails.travelers} onChange={(event) => setTripDetails({ ...tripDetails, travelers: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="text-xs text-slate-600">Presupuesto
                <input type="number" min={0} step="0.01" value={tripDetails.budget} onChange={(event) => setTripDetails({ ...tripDetails, budget: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Moneda
                <select value={tripDetails.currency} onChange={(event) => setTripDetails({ ...tripDetails, currency: event.target.value as Currency })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {(["EUR", "USD", "GBP", "MAD"] as const).map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 justify-self-start rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 md:col-span-2"
          >
            {loading ? "Consultando..." : warning && !itinerary ? "Reintentar itinerario" : "Enviar"}
          </button>
        </form>

        <div className="mt-6 space-y-4" aria-live="polite">
          <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
            <span className="font-semibold">Usuario:</span> {prompt}
          </div>
          <div className={`rounded-2xl p-4 text-base leading-relaxed ${source === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-slate-800"}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-semibold">Asistente</span>
              <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-medium uppercase tracking-[0.08em] text-emerald-800">
                {source === "openrouter" ? "OpenRouter · MiniMax" : source === "error" ? "Error" : "Demo"}
              </span>
            </div>
            {!itinerary && (
              <div className="max-w-none break-words text-sm leading-6">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-bold">{children}</h2>,
                    h2: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold">{children}</h3>,
                    h3: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold">{children}</h4>,
                    p: ({ children }) => <p className="my-2">{children}</p>,
                    ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
                    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
                    li: ({ children }) => <li className="pl-1">{children}</li>,
                    blockquote: ({ children }) => (
                      <blockquote className="my-3 border-l-4 border-emerald-300 pl-4 text-slate-600">{children}</blockquote>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">{children}</code>
                    ),
                  }}
                >
                  {answer}
                </ReactMarkdown>
              </div>
            )}
            {itinerary && (
              <section className="mt-4 space-y-4" aria-label="Itinerario estructurado">
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{itinerary.destination}</h2>
                      <p className="text-sm text-slate-600">{itinerary.durationDays} días</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">
                        Periodo: {formatTripPeriod(itinerary.startDate ?? tripDetails.startDate, itinerary.endDate ?? tripDetails.endDate)}
                      </p>
                      <p className="text-xs text-slate-500">Horario general de actividades: 09:00–21:00 · las fechas no indican horas de transporte.</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-right">
                      <p className="text-xs text-emerald-800">{itinerary.budget.status === "provided" ? "Presupuesto indicado" : "Presupuesto estimado"}</p>
                      <p className="font-semibold text-emerald-950">
                        {formatEstimate(itinerary.budget.total, itinerary.budget.currency)}
                      </p>
                    </div>
                  </div>
                </div>
                {itinerary.days.map((day) => (
                  <article key={day.dayNumber} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-base font-semibold">
                      Día {day.dayNumber}: {day.theme}
                    </h3>
                    {(day.date || itinerary.startDate) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatIsoDate(day.date ?? (itinerary.startDate ? addIsoDays(itinerary.startDate, day.dayNumber - 1) : undefined))}
                        · Actividades 09:00–21:00
                      </p>
                    )}
                    {day.summary && <p className="mt-2 text-sm text-slate-600">{day.summary}</p>}
                    {day.items.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-600">No se propusieron actividades para este día.</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {day.items.map((activity, index) => (
                          <li key={`${day.dayNumber}-${index}-${activity.name}`} className="rounded-xl bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {activity.startTime && activity.endTime
                                ? <time className="rounded-lg bg-white px-2 py-1 text-sm font-semibold tabular-nums">{activity.startTime}–{activity.endTime}</time>
                                : <span className="rounded-lg bg-white px-2 py-1 text-xs text-slate-500">Horario no disponible (itinerario anterior)</span>}
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">{getBlockTypeLabel(activity.blockType)}</span>
                              <h4 className="font-medium">{activity.name}</h4>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">{activity.description}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                              <span className="rounded-full bg-white px-2.5 py-1">
                                {activity.durationMinutes} min estimados
                              </span>
                              {activity.location && <span className="rounded-full bg-white px-2.5 py-1">Lugar/zona: {activity.location}</span>}
                              {activity.blockType === "travel" && activity.travelMinutes !== undefined && (
                                <span className="rounded-full bg-white px-2.5 py-1">{activity.travelMinutes} min de desplazamiento (estimación)</span>
                              )}
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">
                                {activity.estimate === undefined
                                  ? "Coste desconocido"
                                  : `${formatEstimate(activity.estimate, activity.currency)} · estimación`}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
                <p className="text-xs text-slate-600">
                  Los costes son estimaciones orientativas y no representan precios verificados.
                </p>
                <SaveTripButton
                  key={`${itinerary.destination}-${itinerary.days.length}-${itinerary.days[0]?.theme}`}
                  draft={{
                    name: `Viaje a ${itinerary.destination}`,
                    destination: itinerary.destination,
                    budget: itinerary.budget.total,
                    currency: itinerary.budget.currency,
                    ...(itinerary.startDate ? { startDate: itinerary.startDate } : {}),
                    ...(itinerary.endDate ? { endDate: itinerary.endDate } : {}),
                    ...(itinerary.travelers !== undefined ? { travelers: itinerary.travelers } : {}),
                    status: "planificado",
                    itinerary: itinerary.days,
                  }}
                />
              </section>
            )}
            {warning && (
              <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-950" role="status">
                {warning}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
