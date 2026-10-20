import { addIsoDays } from "@/app/lib/date-format";
import type { SavedTrip } from "@/app/lib/persistence/types";

export interface CalendarEntry {
  date: string;
  label: string;
  href: string;
  kind: "trip" | "activity";
  startTime?: string;
}

export function getMonthDates(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber > 12) return [];
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = addIsoDays(`${month}-01`, -mondayOffset);
  if (!start) return [];
  return Array.from({ length: 42 }, (_, index) => addIsoDays(start, index) ?? "");
}

export function getWeekDates(date: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return [];
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  const start = addIsoDays(date, -mondayOffset);
  if (!start) return [];
  return Array.from({ length: 7 }, (_, index) => addIsoDays(start, index) ?? "");
}

export function getCalendarEntries(trips: SavedTrip[]): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const trip of trips) {
    if (!trip.startDate || !trip.endDate) continue;
    for (let date = trip.startDate; date <= trip.endDate;) {
      entries.push({
        date,
        label: `${trip.name} · ${trip.destination}`,
        href: `/viajes#trip-${encodeURIComponent(trip.id)}`,
        kind: "trip",
      });
      const nextDate = addIsoDays(date, 1);
      if (!nextDate || nextDate <= date) break;
      date = nextDate;
    }
    for (const day of trip.itinerary) {
      const date = day.date ?? addIsoDays(trip.startDate, day.dayNumber - 1);
      if (!date) continue;
      for (const activity of day.items) {
        entries.push({
          date,
          label: activity.name,
          href: `/viajes#activity-${encodeURIComponent(activity.id)}`,
          kind: "activity",
          ...(activity.startTime ? { startTime: activity.startTime } : {}),
        });
      }
    }
  }
  return entries.sort((left, right) =>
    left.date.localeCompare(right.date)
    || (left.startTime ?? "").localeCompare(right.startTime ?? "")
    || left.label.localeCompare(right.label, "es"),
  );
}
