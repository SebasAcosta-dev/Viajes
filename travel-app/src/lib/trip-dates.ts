import { addIsoDays } from "@/lib/date-format";
import type { TripDraft } from "@/lib/persistence/types";

export function dateInTimeZone(date: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  }
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function localTodayIso(date = new Date()): string {
  return dateInTimeZone(date, Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
}

export function requestTodayIso(request: Request, date = new Date()): string {
  return dateInTimeZone(date, request.headers.get("x-user-time-zone") || "UTC");
}

export function normalizeDateRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  return {
    startDate,
    endDate: startDate && endDate && endDate < startDate ? startDate : endDate,
  };
}

export function normalizeNewDateRange(
  startDate: string,
  endDate: string,
  today: string,
): { startDate: string; endDate: string } {
  if (startDate && startDate < today) {
    if (endDate && endDate >= startDate) return shiftedDateRange(startDate, endDate, today);
    return { startDate: today, endDate: endDate ? today : "" };
  }
  return normalizeDateRange(startDate, endDate);
}

export function normalizeNewTripDates(draft: TripDraft, today: string): TripDraft {
  if (draft.startDate && draft.startDate >= today && draft.endDate) return draft;

  const durationDays = draft.itinerary.length;
  const startDate = draft.startDate && draft.startDate >= today ? draft.startDate : today;
  const endDate = draft.startDate && draft.startDate >= today && draft.endDate
    ? draft.endDate
    : addIsoDays(startDate, durationDays - 1) ?? startDate;
  return {
    ...draft,
    startDate,
    endDate,
    itinerary: draft.itinerary.map((day, index) => ({
      ...day,
      date: addIsoDays(startDate, index) ?? startDate,
    })),
  };
}

export function shiftedDateRange(startDate: string, endDate: string, newStartDate: string): {
  startDate: string;
  endDate: string;
} {
  const duration = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
  return {
    startDate: newStartDate,
    endDate: addIsoDays(newStartDate, Number.isFinite(duration) && duration >= 0 ? duration : 0) ?? newStartDate,
  };
}
