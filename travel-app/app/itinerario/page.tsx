"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SaveTripButton } from "@/app/components/save-trip-button";
import { getTripBudgetSummary } from "@/app/lib/itinerary";
import { calculateScheduledEnd, getBlockTypeLabel } from "@/app/lib/itinerary-schedule";
import { addIsoDays, formatIsoDate } from "@/app/lib/date-format";
import { loadGeneratedItinerary, saveGeneratedItinerary, type GeneratedItineraryDraft } from "@/app/lib/generated-itinerary";
import { getPlannerDraftScope } from "@/app/lib/persistence/profile-client";
import type { ItineraryItem } from "@/app/lib/types";

function money(value: number, currency: ItineraryItem["currency"]): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(value);
}

function priceLabel(item: ItineraryItem): string {
  if (item.priceStatus === "free_verified") return "Actividad gratuita verificada";
  if (item.priceStatus === "verified") return "Precio verificado";
  if (item.priceStatus === "unknown" || item.estimate === undefined) return "Precio no disponible";
  return "Estimación orientativa";
}

function ActivityEditor({
  activity,
  travelers,
  onSave,
}: {
  activity: ItineraryItem;
  travelers: number;
  onSave: (activity: ItineraryItem) => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description);
  const [duration, setDuration] = useState(String(activity.durationMinutes));
  const [pricePerPerson, setPricePerPerson] = useState(activity.pricePerPerson?.toString() ?? "");
  const [editError, setEditError] = useState("");

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const perPerson = pricePerPerson.trim() ? Number(pricePerPerson) : undefined;
    const durationMinutes = Number(duration);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 720) {
      setEditError("La duración debe ser un número de minutos entre 1 y 720.");
      return;
    }
    if (perPerson !== undefined && (!Number.isFinite(perPerson) || perPerson <= 0)) {
      setEditError("El precio estimado debe ser mayor que cero o dejarse vacío.");
      return;
    }
    const endTime = activity.startTime ? calculateScheduledEnd(activity.startTime, durationMinutes) : undefined;
    if (activity.startTime && !endTime) {
      setEditError("La duración no cabe en el horario diario de 09:00 a 21:00.");
      return;
    }
    const updated: ItineraryItem = {
      ...activity,
      name: name.trim(),
      description: description.trim(),
      durationMinutes,
      ...(endTime ? { endTime } : {}),
      ...(perPerson !== undefined
        ? {
            pricePerPerson: perPerson,
            estimate: Number((perPerson * travelers).toFixed(2)),
            priceStatus: "estimate" as const,
          }
        : {
            pricePerPerson: undefined,
            estimate: undefined,
            priceStatus: "unknown" as const,
          }),
    };
    if (onSave(updated)) {
      setEditError("");
      setEditing(false);
    }
  };

  return (
    <div className="mt-3">
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
          Editar actividad
        </button>
      ) : (
        <form onSubmit={save} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
          {activity.startTime && activity.endTime && (
            <p className="text-xs text-slate-600 sm:col-span-2">
              Horario del bloque: <span className="font-semibold tabular-nums">{activity.startTime}–{activity.endTime}</span>
            </p>
          )}
          <label className="text-xs text-slate-600">Nombre
            <input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-600">Duración (minutos)
            <input required type="number" min={1} max={1440} value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">Descripción
            <textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          </label>
          {editError && <p role="alert" className="text-xs text-red-700 sm:col-span-2">{editError}</p>}
          <label className="text-xs text-slate-600">Precio estimado por persona ({activity.currency})
            <input type="number" min={0.01} step="0.01" value={pricePerPerson} onChange={(event) => setPricePerPerson(event.target.value)} placeholder="Deja vacío si no se conoce" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Aplicar cambios</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ItineraryPage() {
  const [draft, setDraft] = useState<GeneratedItineraryDraft | null>(null);
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editError, setEditError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(async () => {
        const scope = await getPlannerDraftScope();
        const savedDraft = loadGeneratedItinerary(scope);
        if (active) {
          setDraftScope(scope);
          setDraft(savedDraft);
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "No se pudo abrir el itinerario.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => {
    if (!draft) return null;
    return getTripBudgetSummary({
      budget: draft.form.budget,
      currency: draft.form.currency,
      travelers: draft.form.travelers,
      itinerary: draft.itinerary.days,
    });
  }, [draft]);

  const updateActivity = (dayIndex: number, activity: ItineraryItem): boolean => {
    if (!draft) return false;
    const day = draft.itinerary.days[dayIndex];
    if (activity.startTime && activity.endTime) {
      const startMinutes = Number(activity.startTime.slice(0, 2)) * 60 + Number(activity.startTime.slice(3, 5));
      const endMinutes = Number(activity.endTime.slice(0, 2)) * 60 + Number(activity.endTime.slice(3, 5));
      const overlaps = day.items.some((entry) => {
        if (entry.id === activity.id || !entry.startTime || !entry.endTime) return false;
        const otherStart = Number(entry.startTime.slice(0, 2)) * 60 + Number(entry.startTime.slice(3, 5));
        const otherEnd = Number(entry.endTime.slice(0, 2)) * 60 + Number(entry.endTime.slice(3, 5));
        return startMinutes < otherEnd && otherStart < endMinutes;
      });
      if (overlaps) {
        setEditError("La nueva duración se solapa con otro bloque. Reduce la duración para conservar el horario.");
        return false;
      }
    }
    const itinerary = {
      ...draft.itinerary,
      days: draft.itinerary.days.map((day, index) => index === dayIndex
        ? { ...day, items: day.items.map((item) => item.id === activity.id ? activity : item) }
        : day),
    };
    const updatedDraft = { ...draft, itinerary };
    try {
      if (!draftScope) throw new Error("Aún no se ha preparado el almacenamiento de este usuario.");
      saveGeneratedItinerary(updatedDraft, draftScope);
      setDraft(updatedDraft);
      setEditError("");
      return true;
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "No se pudo guardar el cambio en el borrador.");
      return false;
    }
  };

  if (loadError) {
    return <main className="mx-auto w-full max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-8"><p className="rounded-xl bg-red-50 p-4 text-red-800" role="alert">{loadError}</p><Link href="/" className="mt-4 inline-block font-semibold text-emerald-700 underline">Volver al planificador</Link></main>;
  }

  if (loading) {
    return <main className="mx-auto w-full max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-8"><p role="status" className="text-base text-slate-600">Cargando itinerario…</p></main>;
  }

  if (!draft) {
    return (
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold sm:text-3xl">No hay un itinerario generado</h1>
        <p className="mt-2 text-slate-600">Completa el formulario para crear un plan. Los borradores de este navegador se mantienen al navegar o recargar.</p>
        <Link href="/" className="mt-4 inline-block rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Ir al planificador</Link>
      </main>
    );
  }

  const { form, itinerary } = draft;
  const knownPrices = itinerary.days.flatMap((day) => day.items).filter((activity) =>
    (activity.blockType === undefined || activity.blockType === "activity") &&
    activity.budgetCategory !== "gastronomy" && activity.estimate !== undefined && activity.priceStatus !== "unknown",
  ).length;

  return (
    <main className="mx-auto w-full max-w-screen-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Resultado del planificador · {draft.source === "openrouter" ? "OpenRouter · MiniMax" : "Modo demo"}</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Itinerario para {itinerary.destination}</h1>
        </div>
        <Link href="/" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Volver y editar el formulario</Link>
      </header>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:p-6">
        <div><p className="text-xs text-slate-500">Origen → destino</p><p className="font-semibold">{form.origin} → {itinerary.destination}</p></div>
        <div><p className="text-xs text-slate-500">Periodo del viaje</p><p className="font-semibold">Salida: {formatIsoDate(form.startDate)} · Regreso: {formatIsoDate(form.endDate)}</p></div>
        <div><p className="text-xs text-slate-500">Viajeros</p><p className="font-semibold">{form.travelers}</p></div>
        <div><p className="text-xs text-slate-500">Horario de actividades</p><p className="font-semibold">09:00–21:00 · orientativo</p><p className="text-xs text-slate-500">Las fechas no indican horas reales de vuelos o trenes.</p></div>
        <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs text-slate-500">Intereses utilizados</p><p className="font-semibold">{form.interests.join(" · ")}</p></div>
      </section>

      {summary && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-lg font-semibold text-emerald-950">Presupuesto para actividades y visitas</h2>
          <p className="mt-1 text-xs text-emerald-900">Excluye transporte, alojamiento, compras personales y comidas. Los costes gastronómicos se muestran aparte.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <div><dt className="text-xs text-emerald-800">Disponible</dt><dd className="font-semibold">{money(form.budget, form.currency)}</dd></div>
            <div><dt className="text-xs text-emerald-800">Estimación conocida de visitas</dt><dd className="font-semibold">{money(summary.totalEstimated, form.currency)}</dd></div>
            <div><dt className="text-xs text-emerald-800">Precios disponibles</dt><dd className="font-semibold">{knownPrices} · {summary.unknownActivityPrices} sin precio</dd></div>
            <div><dt className="text-xs text-emerald-800">Restante tras gastos reales</dt><dd className="font-semibold">{money(summary.remainingBudget, form.currency)} <span className="font-normal">(sin gastos registrados)</span></dd></div>
            <div><dt className="text-xs text-emerald-800">Proyección tras estimaciones conocidas</dt><dd className="font-semibold">{money(summary.projectedRemaining, form.currency)}</dd></div>
            <div><dt className="text-xs text-emerald-800">Precio desconocido</dt><dd className="font-semibold">{summary.projectionIncomplete ? "La proyección es incompleta" : "Todos los precios de visitas están indicados"}</dd></div>
          </dl>
        </section>
      )}

      <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="Itinerario por días">
        {editError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{editError}</p>}
        {itinerary.days.map((day, dayIndex) => (
          <article key={day.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-sky-700">
                  Día {day.dayNumber}{(day.date || form.startDate) ? ` · ${formatIsoDate(day.date ?? addIsoDays(form.startDate, dayIndex))}` : ""}
                </p>
                <h2 className="text-xl font-semibold">{day.theme}</h2>
                <p className="text-xs text-slate-500">Horario general de actividades: 09:00–21:00</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{day.items.length} bloques horarios</span>
            </div>
            {day.summary && <p className="mt-2 text-sm text-slate-600">{day.summary}</p>}
            <p className="mt-2 text-xs text-slate-500">Horario y desplazamientos orientativos; no hay datos conectados de aperturas ni rutas en tiempo real.</p>
            <ol className="mt-4 space-y-3 border-l-2 border-slate-200 pl-3 sm:pl-5">
              {day.items.map((activity) => (
                <li key={activity.id} className={`rounded-2xl border p-4 ${
                  activity.blockType === "travel" ? "border-sky-200 bg-sky-50" :
                  activity.blockType === "breakfast" || activity.blockType === "lunch" || activity.blockType === "dinner" ? "border-orange-200 bg-orange-50" :
                  activity.blockType === "rest" || activity.blockType === "free_time" ? "border-violet-200 bg-violet-50" :
                  "border-slate-200 bg-slate-50"
                }`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {activity.startTime && activity.endTime
                          ? <time className="rounded-lg bg-white px-2 py-1 text-sm font-bold tabular-nums text-slate-900">{activity.startTime}–{activity.endTime}</time>
                          : <span className="rounded-lg bg-white px-2 py-1 text-xs text-slate-500">Horario no disponible (itinerario anterior)</span>}
                        <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs text-slate-600">{getBlockTypeLabel(activity.blockType)}</span>
                        <h3 className="font-semibold">{activity.name}</h3>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{activity.description || "Sin descripción adicional."}</p>
                    </div>
                    {(activity.blockType === undefined || activity.blockType === "activity") && (
                      <span className={`rounded-full px-2.5 py-1 text-xs ${activity.priceStatus === "verified" || activity.priceStatus === "free_verified" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{priceLabel(activity)}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                    <span className="rounded-full bg-white px-3 py-1.5">{activity.durationMinutes} min estimados</span>
                    {activity.location && <span className="rounded-full bg-white px-3 py-1.5">Lugar/zona: {activity.location}</span>}
                    {activity.blockType === "travel" && activity.travelMinutes !== undefined && <span className="rounded-full bg-white px-3 py-1.5">{activity.travelMinutes} min de desplazamiento (estimación)</span>}
                    {activity.pricePerPerson !== undefined && <span className="rounded-full bg-white px-3 py-1.5">{money(activity.pricePerPerson, activity.currency)} por persona</span>}
                    {activity.estimate !== undefined && activity.priceStatus !== "unknown" && <span className="rounded-full bg-white px-3 py-1.5">{money(activity.estimate, activity.currency)} total estimado para {form.travelers}</span>}
                    {activity.budgetCategory === "gastronomy" && <span className="rounded-full bg-orange-100 px-3 py-1.5 text-orange-900">Fuera del presupuesto de visitas</span>}
                  </div>
                  {activity.priceSource
                    ? <p className="mt-2 text-xs text-slate-500">Fuente: {activity.priceSource}{activity.priceCheckedAt ? ` · consultada ${activity.priceCheckedAt}` : ""}</p>
                    : <p className="mt-2 text-xs text-slate-500">Sin fuente externa de precios conectada. Los importes indicados son orientativos.</p>}
                  {activity.interestTags?.length ? <p className="mt-2 text-xs text-slate-500">Relacionada con: {activity.interestTags.join(", ")}</p> : null}
                  <p className="mt-2 text-xs text-slate-500">Fiabilidad: {activity.reliability === "verified" ? "verificado" : activity.reliability === "unknown" ? "no disponible" : "orientativo"}.</p>
                  {(activity.blockType === undefined || activity.blockType === "activity") && (
                    <ActivityEditor activity={activity} travelers={form.travelers} onSave={(updated) => updateActivity(dayIndex, updated)} />
                  )}
                </li>
              ))}
              {day.items.length === 0 && <li className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No se encontraron actividades locales vinculadas a estos intereses en el modo demo. Prueba con el asistente real o amplía tus intereses.</li>}
            </ol>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Guardar el viaje</h2>
        <p className="mt-1 text-sm text-slate-600">El itinerario se conserva como borrador local hasta que decidas guardarlo. Guardar en Supabase requiere iniciar sesión.</p>
        <SaveTripButton
          key={`${itinerary.destination}-${draft.generatedAt}`}
          draft={{
            name: `Viaje a ${itinerary.destination}`,
            origin: form.origin,
            destination: itinerary.destination,
            startDate: form.startDate,
            endDate: form.endDate,
            travelers: form.travelers,
            budget: form.budget,
            currency: form.currency,
            interests: form.interests,
            travelType: form.travelType,
            status: "planificado",
            itinerary: itinerary.days,
          }}
        />
        <Link href="/presupuesto" className="mt-4 inline-block text-sm font-semibold text-emerald-700 underline">Consultar presupuesto</Link>
      </section>
    </main>
  );
}
