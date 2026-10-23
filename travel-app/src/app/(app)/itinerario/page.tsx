"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { SaveTripButton } from "@/features/trips/components/save-trip-button";
import { getTripBudgetSummary } from "@/lib/itinerary";
import { calculateScheduledEnd, minutesToTime, moveItineraryActivity, proposeActivitySchedule, timeToMinutes } from "@/lib/itinerary-schedule";
import { addIsoDays, formatIsoDate } from "@/lib/date-format";
import { loadGeneratedItinerary, saveGeneratedItinerary, type GeneratedItineraryDraft } from "@/lib/generated-itinerary";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";
import type { ItineraryItem } from "@/lib/types";
import type { ActivityAlternative } from "@/lib/ai";
import { PageHeading } from "@/components/ui";
import { ActivityEditor, getActivityCategoryClasses } from "@/features/itinerary/components/activity-editor";
import { ActivityAssistant } from "@/features/itinerary/components/activity-assistant";
import { ItineraryDayHeader } from "@/features/itinerary/components/itinerary-day-header";
import { ActivityCreateForm } from "@/features/itinerary/components/activity-create-form";
import { ActivitySummary } from "@/features/itinerary/components/activity-summary";
import { formatMoney } from "@/lib/money";

function money(value: number, currency: ItineraryItem["currency"]): string {
  return formatMoney(value, currency);
}

function getScheduleConflicts(items: ItineraryItem[]): string[] {
  const timed = items.flatMap((item) => {
    const start = item.startTime ? timeToMinutes(item.startTime) : undefined;
    const end = item.endTime ? timeToMinutes(item.endTime) : undefined;
    return start !== undefined && end !== undefined ? [{ item, start, end }] : [];
  }).sort((left, right) => left.start - right.start);
  return timed.slice(1).flatMap((entry, index) =>
    entry.start < timed[index].end ? [`${timed[index].item.name} y ${entry.item.name}`] : [],
  );
}

export default function ItineraryPage() {
  const [draft, setDraft] = useState<GeneratedItineraryDraft | null>(null);
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editError, setEditError] = useState("");
  const [insertionPoint, setInsertionPoint] = useState<{ dayId: string; beforeActivityId: string | null } | null>(null);
  const [pendingReview, setPendingReview] = useState<{ dayId: string; title: string; keep: ItineraryItem[]; reorganized?: ItineraryItem[]; selected: "keep" | "reorganize" | null } | null>(null);
  const [dragging, setDragging] = useState<{ dayId: string; activityId: string } | null>(null);
  const [reorganizingDays, setReorganizingDays] = useState<Record<string, boolean>>({});

  const reviewSchedule = (dayId: string, title: string, items: ItineraryItem[]) => {
    setPendingReview({ dayId, title, keep: items, reorganized: proposeActivitySchedule(items), selected: null });
  };

  const confirmSchedule = () => {
    if (!draft || !pendingReview || !pendingReview.selected) return;
    const items = pendingReview.selected === "keep" ? pendingReview.keep : pendingReview.reorganized;
    if (!items) return;
    const itinerary = {
      ...draft.itinerary,
      days: draft.itinerary.days.map((day) => day.id === pendingReview.dayId
        ? { ...day, items: items.map((item, index) => ({ ...item, order: index + 1 })) }
        : day),
    };
    if (persistDraft({ ...draft, itinerary })) setPendingReview(null);
  };

  const moveActivity = (dayId: string, activityId: string, offset: -1 | 1) => {
    const day = draft?.itinerary.days.find((entry) => entry.id === dayId);
    if (!day) return;
    const index = day.items.findIndex((entry) => entry.id === activityId);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= day.items.length) return;
    const items = moveItineraryActivity(day.items, activityId, day.items[nextIndex].id);
    reviewSchedule(dayId, "Reordenar actividades", items);
  };


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

  const persistDraft = (updatedDraft: GeneratedItineraryDraft): boolean => {
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

  const updateActivity = (dayIndex: number, activity: ItineraryItem): boolean => {
    if (!draft) return false;
    const day = draft.itinerary.days[dayIndex];
    if (activity.startTime && activity.endTime) {
      const startMinutes = timeToMinutes(activity.startTime);
      const endMinutes = timeToMinutes(activity.endTime);
      if (startMinutes === undefined || endMinutes === undefined || endMinutes <= startMinutes) {
        setEditError("El fin debe ser posterior al inicio dentro del mismo día.");
        return false;
      }
      const overlaps = day.items.some((entry) => {
        if (entry.id === activity.id || !entry.startTime || !entry.endTime) return false;
        const otherStart = timeToMinutes(entry.startTime);
        const otherEnd = timeToMinutes(entry.endTime);
        if (otherStart === undefined || otherEnd === undefined) return false;
        return startMinutes < otherEnd && otherStart < endMinutes;
      });
      if (overlaps) {
        setEditError("La nueva duración se solapa con otro bloque. Ajusta la hora o la duración para conservar el horario.");
        return false;
      }
    }
    const itinerary = {
      ...draft.itinerary,
      days: draft.itinerary.days.map((entry, index) => index === dayIndex
        ? { ...entry, items: entry.items.map((item) => item.id === activity.id ? activity : item) }
        : entry),
    };
    return persistDraft({ ...draft, itinerary });
  };

  const addActivity = (dayId: string, beforeActivityId: string | null, activity: ItineraryItem) => {
    if (!draft) return;
    const dayIndex = draft.itinerary.days.findIndex((day) => day.id === dayId);
    const day = draft.itinerary.days[dayIndex];
    const insertionIndex = beforeActivityId === null
      ? day?.items.length ?? -1
      : day?.items.findIndex((activity) => activity.id === beforeActivityId) ?? -1;
    if (!day || insertionIndex < 0) {
      setEditError("No se encontró el punto de inserción de la actividad.");
      return;
    }
    const items = [...day.items];
    items.splice(insertionIndex, 0, { ...activity, currency: draft.form.currency, order: insertionIndex + 1 });
    items.sort((left, right) => (left.startTime ?? "99:99").localeCompare(right.startTime ?? "99:99")
      || (left.endTime ?? "99:99").localeCompare(right.endTime ?? "99:99"));
    items.forEach((item, index) => { item.order = index + 1; });
    setInsertionPoint(null);
    reviewSchedule(dayId, `Añadir “${activity.name}”`, items.map((item, order) => ({ ...item, order: order + 1 })));
  };

  const removeDraftActivity = (dayId: string, activity: ItineraryItem) => {
    if (!draft || !window.confirm(`¿Eliminar «${activity.name}» de esta jornada?`)) return;
    const itinerary = { ...draft.itinerary, days: draft.itinerary.days.map((day) => day.id === dayId
      ? { ...day, items: day.items.filter((item) => item.id !== activity.id).map((item, index) => ({ ...item, order: index + 1 })) }
      : day) };
    persistDraft({ ...draft, itinerary });
  };

  const selectAlternative = (dayId: string, activity: ItineraryItem, alternative: ActivityAlternative) => {
    if (!draft) return;
    const day = draft.itinerary.days.find((entry) => entry.id === dayId);
    const startTime = activity.startTime;
    const endTime = startTime ? calculateScheduledEnd(startTime, alternative.durationMinutes) : undefined;
    if (!day || !startTime || !endTime) { setEditError("La alternativa necesita una hora de inicio valida. Ajusta el horario antes de aplicarla."); return; }
    const replacement: ItineraryItem = { ...activity, name: alternative.name, description: alternative.description, durationMinutes: alternative.durationMinutes, startTime, endTime, location: alternative.location, estimate: undefined, pricePerPerson: undefined, priceStatus: "unknown" };
    reviewSchedule(day.id, `Sustituir por ${alternative.name}`, day.items.map((item) => item.id === activity.id ? replacement : item));
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
  const modelLabel = draft.model ?? "modelo configurado";
  const knownPrices = itinerary.days.flatMap((day) => day.items).filter((activity) =>
    (activity.blockType === undefined || activity.blockType === "activity") &&
    activity.budgetCategory !== "gastronomy" && activity.estimate !== undefined && activity.priceStatus !== "unknown",
  ).length;

  return (
    <main className="itinerary-page mx-auto w-full max-w-screen-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <PageHeading eyebrow={`Tu plan · ${draft.source === "openrouter" ? `OpenRouter · ${modelLabel}` : "Modo demo"}`} title={`Itinerario para ${itinerary.destination}`} description="Revisa cada jornada y ajusta los detalles antes de guardar el viaje."
        actions={<Link href="/" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Volver y editar el formulario</Link>} />

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:p-6">
        <div><p className="text-xs text-slate-500">Origen → destino</p><p className="font-semibold">{form.origin} → {itinerary.destination}</p></div>
        <div><p className="text-xs text-slate-500">Periodo del viaje</p><p className="font-semibold">Salida: {formatIsoDate(form.startDate)} · Regreso: {formatIsoDate(form.endDate)}</p></div>
        <div><p className="text-xs text-slate-500">Viajeros</p><p className="font-semibold">{form.travelers}</p></div>
        <div><p className="text-xs text-slate-500">Horario de actividades</p><p className="font-semibold">Elige las horas de cada actividad</p><p className="text-xs text-slate-500">Las fechas no indican horas reales de vuelos o trenes.</p></div>
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
            <ItineraryDayHeader dayNumber={day.dayNumber} dateLabel={(day.date || form.startDate) ? formatIsoDate(day.date ?? addIsoDays(form.startDate, dayIndex)) : undefined} title={day.theme} activityCount={day.items.length} adding={insertionPoint?.dayId === day.id && insertionPoint.beforeActivityId === null} reorganizing={Boolean(reorganizingDays[day.id])} onAdd={() => { setEditError(""); setInsertionPoint(insertionPoint?.dayId === day.id ? null : { dayId: day.id, beforeActivityId: null }); }} onToggleReorganization={() => setReorganizingDays((days) => ({ ...days, [day.id]: !days[day.id] }))} />
            {day.summary && <p className="mt-2 text-sm text-slate-600">{day.summary}</p>}
            {insertionPoint?.dayId === day.id && insertionPoint.beforeActivityId === null && <div className="mt-3"><ActivityCreateForm currency={form.currency} existingItems={day.items} suggestedStart={minutesToTime((timeToMinutes(day.items.at(-1)?.endTime ?? "09:00") ?? 540) + 15) ?? "09:00"} onSave={(addedActivity) => addActivity(day.id, null, addedActivity)} onCancel={() => setInsertionPoint(null)} /></div>}

            <ol className="mt-4 space-y-2">
              {day.items.map((activity) => (
                <Fragment key={activity.id}>
                  <li id={`activity-${activity.id}`} draggable={Boolean(reorganizingDays[day.id])} onDragStart={(event) => { const target = event.target; if (!reorganizingDays[day.id] || !(target instanceof HTMLElement) || target.closest("button,input,textarea,select,summary,a")) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", activity.id); setDragging({ dayId: day.id, activityId: activity.id }); }} onDragOver={(event) => { if (reorganizingDays[day.id] && dragging?.dayId === day.id) event.preventDefault(); }} onDrop={(event) => {
                    event.preventDefault();
                    if (!reorganizingDays[day.id] || !dragging || dragging.dayId !== day.id || dragging.activityId === activity.id) return;
                    const reordered = moveItineraryActivity(day.items, dragging.activityId, activity.id);
                    setDragging(null);
                    reviewSchedule(day.id, "Reordenar actividades", reordered.map((item, index) => ({ ...item, order: index + 1 })));
                  }} onDragEnd={() => setDragging(null)} className={`rounded-xl border px-3 py-3 sm:px-4 ${getActivityCategoryClasses(activity)} ${dragging?.activityId === activity.id ? "opacity-50" : ""} ${reorganizingDays[day.id] ? "cursor-grab border-dashed active:cursor-grabbing" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1"><ActivitySummary activity={activity} /></div>
                      <div className="flex flex-wrap items-center gap-2">

                        {reorganizingDays[day.id] && <button type="button" aria-label={`Mover ${activity.name} arriba`} disabled={day.items[0]?.id === activity.id} onClick={() => moveActivity(day.id, activity.id, -1)} className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs disabled:opacity-40">↑</button>}
                        {reorganizingDays[day.id] && <button type="button" aria-label={`Mover ${activity.name} abajo`} disabled={day.items.at(-1)?.id === activity.id} onClick={() => moveActivity(day.id, activity.id, 1)} className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs disabled:opacity-40">↓</button>}

                      </div>
                    </div>
                    <details className="mt-2 text-sm">
                      <summary className="w-fit cursor-pointer text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-4">Ver detalles</summary>
                      <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                        {activity.description && <div className="sm:col-span-2"><dt className="font-semibold text-slate-700">DescripciÃ³n</dt><dd className="mt-0.5 whitespace-pre-wrap text-slate-600">{activity.description}</dd></div>}
                        {activity.location && <div><dt className="font-semibold text-slate-700">UbicaciÃ³n</dt><dd className="mt-0.5 text-slate-600">{activity.location}</dd></div>}
                        <div><dt className="font-semibold text-slate-700">DuraciÃ³n</dt><dd className="mt-0.5 text-slate-600">{activity.durationMinutes} min</dd></div>
                        {activity.travelMinutes !== undefined && <div><dt className="font-semibold text-slate-700">Desplazamiento</dt><dd className="mt-0.5 text-slate-600">{activity.travelMinutes} min estimados</dd></div>}
                        {activity.estimate !== undefined && activity.priceStatus !== "unknown" && <div><dt className="font-semibold text-slate-700">Precio</dt><dd className="mt-0.5 text-slate-600">{activity.priceStatus === "free_verified" ? "Gratis" : money(activity.estimate, activity.currency)}{activity.priceStatus === "estimate" ? " · estimación" : ""}</dd></div>}
                        {activity.pricePerPerson !== undefined && <div><dt className="font-semibold text-slate-700">Por persona</dt><dd className="mt-0.5 text-slate-600">{money(activity.pricePerPerson, activity.currency)}</dd></div>}
                        {activity.budgetCategory === "gastronomy" && <div><dt className="font-semibold text-slate-700">Presupuesto</dt><dd className="mt-0.5 text-slate-600">Comida, fuera del presupuesto de visitas</dd></div>}
                        {activity.notes && <div className="sm:col-span-2"><dt className="font-semibold text-slate-700">Nota</dt><dd className="mt-0.5 whitespace-pre-wrap text-slate-600">{activity.notes}</dd></div>}
                        {activity.interestTags?.length ? <div className="sm:col-span-2"><dt className="font-semibold text-slate-700">Intereses</dt><dd className="mt-0.5 text-slate-600">{activity.interestTags.join(", ")}</dd></div> : null}
                      </dl>
                    </details>
                    <ActivityEditor key={`${activity.id}-${activity.name}-${activity.startTime}-${activity.durationMinutes}`} activity={activity} travelers={form.travelers} onSave={(updated) => updateActivity(dayIndex, updated)} />
                    <ActivityAssistant activity={activity} context={{ destination: itinerary.destination, origin: form.origin, startDate: day.date ?? addIsoDays(form.startDate, dayIndex), endDate: day.date ?? addIsoDays(form.startDate, dayIndex), interests: form.interests, notes: form.notes, travelers: form.travelers, budget: form.budget, currency: form.currency, pace: form.pace, travelType: form.travelType }} onApplyAlternative={(alternative) => selectAlternative(day.id, activity, alternative)} />
                    <details className="mt-2"><summary className="w-fit cursor-pointer text-xs text-slate-600 underline">Acciones</summary><button type="button" onClick={() => removeDraftActivity(day.id, activity)} className="mt-2 min-h-10 rounded-lg border border-red-200 px-3 text-sm text-red-700">Eliminar actividad</button></details>

                  </li>
                </Fragment>
              ))}
              {day.items.length === 0 && <li className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">AÃºn no hay actividades en esta jornada.</li>}
            </ol>
                      </article>
        ))}
      </section>

      {pendingReview && (() => {
        const selectedItems = pendingReview.selected === "keep" ? pendingReview.keep
          : pendingReview.selected === "reorganize" ? pendingReview.reorganized : undefined;
        const conflicts = getScheduleConflicts(pendingReview.keep);
        return (
          <section role="dialog" aria-modal="true" aria-labelledby="schedule-review-title" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-6">
            <h2 id="schedule-review-title" className="text-lg font-semibold text-slate-900">Revisar cambios: {pendingReview.title}</h2>
            <p className="mt-1 text-sm text-slate-700">El cambio aún no se ha guardado. Elige cómo tratar los demás horarios y confirma después de revisar la propuesta.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setPendingReview((current) => current ? { ...current, selected: "keep" } : current)} className={`min-h-10 rounded-lg border px-3 text-sm ${pendingReview.selected === "keep" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white"}`}>Mantener los demás horarios</button>
              <button type="button" disabled={!pendingReview.reorganized} onClick={() => setPendingReview((current) => current ? { ...current, selected: "reorganize" } : current)} className={`min-h-10 rounded-lg border px-3 text-sm disabled:opacity-40 ${pendingReview.selected === "reorganize" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white"}`}>Proponer reorganización</button>
            </div>
            {pendingReview.selected === "keep" && conflicts.length > 0 && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-900">Conservar las horas produce solapamientos: {conflicts.join("; ")}. Puedes volver a la agenda y corregirlos.</p>}
            {pendingReview.selected === "reorganize" && !pendingReview.reorganized && <p role="alert" className="mt-3 text-sm text-red-800">No hay una propuesta válida dentro del mismo día. Ajusta las duraciones o las horas manualmente.</p>}
            {selectedItems && <ol className="mt-4 max-h-72 space-y-2 overflow-auto rounded-xl bg-white p-3">
              {selectedItems.map((item) => {
                const original = pendingReview.keep.find((entry) => entry.id === item.id);
                const changed = original && (original.startTime !== item.startTime || original.endTime !== item.endTime);
                return <li key={item.id} className="flex flex-wrap gap-x-3 text-sm"><span className="font-semibold tabular-nums">{item.startTime}–{item.endTime}</span><span>{item.name}</span>{changed && <span className="text-xs text-amber-800">horario ajustado</span>}</li>;
              })}
            </ol>}
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={!pendingReview.selected} onClick={confirmSchedule} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Confirmar y guardar en borrador</button>
              <button type="button" onClick={() => setPendingReview(null)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm">Cancelar</button>
            </div>
          </section>
        );
      })()}

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
