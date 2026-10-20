import type { ItineraryDay, ItineraryItem } from "@/app/lib/types";

const mealSchedule = [
  { blockType: "breakfast", name: "Desayuno libre", startTime: "09:00", endTime: "09:45", durationMinutes: 45 },
  { blockType: "lunch", name: "Tiempo para almorzar", startTime: "13:00", endTime: "14:00", durationMinutes: 60 },
  { blockType: "dinner", name: "Cena libre", startTime: "19:00", endTime: "20:00", durationMinutes: 60 },
] as const;

const activityWindows = [
  { start: 9 * 60 + 45, end: 13 * 60 },
  { start: 14 * 60, end: 19 * 60 },
  { start: 20 * 60, end: 21 * 60 },
];

function minutes(time: string): number {
  const [hours, minutesPart] = time.split(":").map(Number);
  return hours * 60 + minutesPart;
}

function timeLabel(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function freeBlock(dayNumber: number, start: number, end: number, index: number, currency: ItineraryItem["currency"]): ItineraryItem {
  return {
    id: `day-${dayNumber}-schedule-free-${index}`,
    name: "Tiempo libre",
    description: "Margen flexible para descanso, imprevistos o explorar sin una actividad programada.",
    blockType: "free_time",
    startTime: timeLabel(start),
    endTime: timeLabel(end),
    durationMinutes: end - start,
    priceStatus: "unknown",
    budgetCategory: "activity",
    currency,
    order: index,
    notes: "Bloque flexible orientativo.",
    source: "orientativo",
    reliability: "estimated",
  };
}

function createMeal(
  dayNumber: number,
  meal: (typeof mealSchedule)[number],
  existing?: ItineraryItem,
): ItineraryItem {
  return {
    ...(existing ?? {}),
    id: existing?.id ?? `day-${dayNumber}-${meal.blockType}`,
    name: existing?.name ?? meal.name,
    description: existing?.description ?? "Pausa flexible para comer; no incluye recomendación de un establecimiento concreto.",
    blockType: meal.blockType,
    startTime: existing?.startTime ?? meal.startTime,
    endTime: existing?.endTime ?? meal.endTime,
    durationMinutes: existing?.durationMinutes ?? meal.durationMinutes,
    currency: existing?.currency ?? "EUR",
    estimate: undefined,
    pricePerPerson: undefined,
    priceStatus: "unknown",
    priceSource: undefined,
    priceCheckedAt: undefined,
    budgetCategory: "gastronomy",
    order: 0,
    notes: "Horario orientativo; coste gastronómico excluido del presupuesto de actividades.",
    source: "orientativo",
    reliability: "estimated",
  };
}

export function buildDailySchedule(day: ItineraryDay): ItineraryDay | undefined {
  const originalItems = day.items;
  const meals = mealSchedule.map((meal) => {
    const existing = originalItems.find((item) => item.blockType === meal.blockType);
    return createMeal(day.dayNumber, meal, existing);
  });
  const scheduledItems = originalItems.filter((item) =>
    item.blockType !== "breakfast" && item.blockType !== "lunch" && item.blockType !== "dinner" &&
    item.blockType !== "free_time",
  );
  const currency = originalItems[0]?.currency ?? "EUR";
  if (scheduledItems.some((item) => item.startTime !== undefined || item.endTime !== undefined)) {
    const fixedItems = scheduledItems.filter((item) => item.startTime !== undefined && item.endTime !== undefined);
    const unscheduledItems = scheduledItems.filter((item) => item.startTime === undefined && item.endTime === undefined);
    const explicitMeals = meals.filter((meal) => {
      const existing = originalItems.find((item) => item.id === meal.id);
      return existing?.startTime !== undefined && existing.endTime !== undefined;
    });
    const placedItems = [
      ...explicitMeals,
      ...fixedItems.map((item) => ({ ...item, blockType: item.blockType ?? "activity" as const })),
    ];
    const occupied = [...placedItems].sort((left, right) =>
      minutes(left.startTime ?? "00:00") - minutes(right.startTime ?? "00:00"),
    );

    for (const item of fixedItems) {
      const start = item.startTime ? minutes(item.startTime) : 0;
      const end = item.endTime ? minutes(item.endTime) : 0;
      if (
        !item.startTime || !item.endTime || start < 9 * 60 || end > 21 * 60
        || end <= start || end - start !== item.durationMinutes
      ) return undefined;
    }
    for (let index = 1; index < occupied.length; index += 1) {
      if (minutes(occupied[index].startTime ?? "00:00") < minutes(occupied[index - 1].endTime ?? "00:00")) {
        return undefined;
      }
    }

    for (const meal of meals) {
      if (explicitMeals.some((item) => item.id === meal.id)) continue;
      const template = mealSchedule.find((entry) => entry.blockType === meal.blockType);
      if (!template) return undefined;
      const preferredStart = minutes(template.startTime);
      const latestEnd = meal.blockType === "breakfast" ? 12 * 60 + 30
        : meal.blockType === "lunch" ? 15 * 60 + 30
          : 21 * 60;
      let start = preferredStart;
      while (start + meal.durationMinutes <= latestEnd) {
        const conflict = occupied.find((item) =>
          start < minutes(item.endTime ?? "00:00") && minutes(item.startTime ?? "00:00") < start + meal.durationMinutes,
        );
        if (!conflict) break;
        start = minutes(conflict.endTime ?? "00:00");
      }
      if (start + meal.durationMinutes > latestEnd) return undefined;
      const placedMeal = {
        ...meal,
        startTime: timeLabel(start),
        endTime: timeLabel(start + meal.durationMinutes),
      };
      placedItems.push(placedMeal);
      occupied.push(placedMeal);
      occupied.sort((left, right) =>
        minutes(left.startTime ?? "00:00") - minutes(right.startTime ?? "00:00"),
      );
    }

    for (const item of unscheduledItems) {
      let start: number | undefined;
      for (const window of activityWindows) {
        let cursor = window.start;
        for (const reservation of occupied) {
          const reservedStart = minutes(reservation.startTime ?? "00:00");
          const reservedEnd = minutes(reservation.endTime ?? "00:00");
          if (reservedEnd <= cursor || reservedStart >= window.end) continue;
          if (cursor + item.durationMinutes <= Math.min(reservedStart, window.end)) break;
          cursor = Math.max(cursor, reservedEnd);
        }
        if (cursor + item.durationMinutes <= window.end) {
          start = cursor;
          break;
        }
      }
      if (start === undefined) return undefined;
      const placed = {
        ...item,
        blockType: item.blockType ?? "activity",
        startTime: timeLabel(start),
        endTime: timeLabel(start + item.durationMinutes),
        reliability: item.reliability ?? "estimated",
      };
      placedItems.push(placed);
      occupied.push(placed);
      occupied.sort((left, right) =>
        minutes(left.startTime ?? "00:00") - minutes(right.startTime ?? "00:00"),
      );
    }

    const items = placedItems
      .sort((left, right) => minutes(left.startTime ?? "00:00") - minutes(right.startTime ?? "00:00"))
      .map((item, index) => ({ ...item, order: index + 1 }));
    return hasValidDailySchedule({ ...day, items }) ? { ...day, items } : undefined;
  }

  const placed: ItineraryItem[] = [];
  let activityIndex = 0;

  for (const window of activityWindows) {
    let cursor = window.start;
    while (activityIndex < scheduledItems.length) {
      const activity = scheduledItems[activityIndex];
      const duration = activity.durationMinutes;
      if (cursor + duration > window.end) break;
      placed.push({
        ...activity,
        blockType: activity.blockType ?? "activity",
        startTime: timeLabel(cursor),
        endTime: timeLabel(cursor + duration),
        reliability: activity.reliability ?? "estimated",
      });
      cursor += duration;
      activityIndex += 1;
    }
    if (cursor < window.end) placed.push(freeBlock(day.dayNumber, cursor, window.end, placed.length + 1, currency));
  }

  if (activityIndex !== scheduledItems.length) return undefined;

  const items = [...meals, ...placed]
    .sort((left, right) => minutes(left.startTime ?? "00:00") - minutes(right.startTime ?? "00:00"))
    .map((item, index) => ({ ...item, order: index + 1 }));
  return { ...day, items };
}

export function hasValidDailySchedule(day: ItineraryDay): boolean {
  const timedItems = day.items.filter((item) => item.startTime !== undefined || item.endTime !== undefined);
  if (timedItems.length !== day.items.length) return false;
  const sorted = [...day.items].sort((left, right) => minutes(left.startTime ?? "00:00") - minutes(right.startTime ?? "00:00"));
  let previousEnd = 9 * 60;
  for (const item of sorted) {
    if (!item.startTime || !item.endTime || item.durationMinutes !== minutes(item.endTime) - minutes(item.startTime)) return false;
    const start = minutes(item.startTime);
    const end = minutes(item.endTime);
    if (start < 9 * 60 || end > 21 * 60 || start < previousEnd || end <= start) return false;
    previousEnd = end;
  }
  return ["breakfast", "lunch", "dinner"].every((type) => sorted.some((item) => item.blockType === type));
}

export function getBlockTypeLabel(type: ItineraryItem["blockType"] | undefined): string {
  switch (type) {
    case "travel": return "Desplazamiento";
    case "breakfast": return "Desayuno";
    case "lunch": return "Almuerzo";
    case "dinner": return "Cena";
    case "rest": return "Descanso";
    case "free_time": return "Tiempo libre";
    default: return "Visita / actividad";
  }
}

export function calculateScheduledEnd(startTime: string, durationMinutes: number): string | undefined {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
    return undefined;
  }
  const end = minutes(startTime) + durationMinutes;
  if (end > 21 * 60) return undefined;
  return timeLabel(end);
}

export function addDailySchedules(days: ItineraryDay[]): ItineraryDay[] | undefined {
  const result: ItineraryDay[] = [];
  for (const day of days) {
    if (hasValidDailySchedule(day)) {
      result.push(day);
      continue;
    }
    const scheduled = buildDailySchedule(day);
    if (!scheduled || !hasValidDailySchedule(scheduled)) return undefined;
    result.push(scheduled);
  }
  return result;
}
