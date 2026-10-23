"use client";

export function ItineraryDayHeader({
  dayNumber,
  dateLabel,
  title,
  activityCount,
  editable = true,
  adding,
  reorganizing,
  onAdd,
  onToggleReorganization,
}: {
  dayNumber: number;
  dateLabel?: string;
  title: string;
  activityCount: number;
  editable?: boolean;
  adding: boolean;
  reorganizing: boolean;
  onAdd: () => void;
  onToggleReorganization: () => void;
}) {
  return <header className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wider text-sky-700">DÍA {dayNumber}{dateLabel ? ` · ${dateLabel}` : ""}</p>
      <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
      <p className="text-xs text-slate-500">{activityCount} {activityCount === 1 ? "actividad" : "actividades"}</p>
    </div>
    {editable && <div className="flex flex-wrap gap-2">
      <button type="button" aria-expanded={adding} onClick={onAdd} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white">{adding ? "Cerrar formulario" : "+ Añadir actividad"}</button>
      <button type="button" aria-pressed={reorganizing} onClick={onToggleReorganization} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">{reorganizing ? "Terminar reorganización" : "Reorganizar día"}</button>
    </div>}
  </header>;
}
