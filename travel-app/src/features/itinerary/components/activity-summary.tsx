import { getBlockTypeLabel } from "@/lib/itinerary-schedule";
import type { ItineraryItem } from "@/lib/types";

export function ActivitySummary({ activity }: { activity: ItineraryItem }) {
  return <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
    {activity.startTime && activity.endTime
      ? <time className="text-base font-bold tabular-nums text-slate-900 sm:text-lg">{activity.startTime}–{activity.endTime}</time>
      : <span className="text-sm text-slate-500">Horario pendiente</span>}
    <span className="font-semibold text-slate-900">{activity.name}</span>
    {activity.blockType && activity.blockType !== "activity" && <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-700">{getBlockTypeLabel(activity.blockType)}</span>}
  </div>;
}
