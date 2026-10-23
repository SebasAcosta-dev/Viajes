import type { ItineraryDay, ItineraryItem } from "@/lib/types";

const mealSchedule = [
  { blockType: "breakfast", name: "Desayuno libre", startTime: "09:00", endTime: "09:45", durationMinutes: 45 },
  { blockType: "lunch", name: "Tiempo para almorzar", startTime: "13:00", endTime: "14:00", durationMinutes: 60 },
  { blockType: "dinner", name: "Cena libre", startTime: "19:00", endTime: "20:00", durationMinutes: 60 },
] as const;

const activityWindows = [
  { start: 6 * 60, end: 9 * 60 },
  { start: 9 * 60 + 45, end: 13 * 60 },
  { start: 14 * 60, end: 19 * 60 },
  { start: 20 * 60, end: 23 * 60 + 59 },
];

function minutes(time: string): number {
  const [hours, minutesPart] = time.split(":").map(Number);
  return hours * 60 + minutesPart;
}

export function timeToMinutes(time: string): number | undefined {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined;
  return minutes(time);
}

export function moveItineraryActivity(items: ItineraryItem[], sourceId: string, targetId: string): ItineraryItem[] {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const moved = [...items];
  const [activity] = moved.splice(sourceIndex, 1);
  moved.splice(targetIndex, 0, activity);
  return moved.map((item, index) => ({ ...item, order: index + 1 }));
}

export function minutesToTime(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 23 * 60 + 59) return undefined;
  return timeLabel(value);
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
      if (!item.startTime || !item.endTime || end <= start || end - start !== item.durationMinutes) return undefined;
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
          : 23 * 60 + 59;
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
  let previousEnd = 0;
  for (const item of sorted) {
    if (!item.startTime || !item.endTime) return false;
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    if (start === undefined || end === undefined || item.durationMinutes !== end - start) return false;
    if (start < 0 || end > 23 * 60 + 59 || start < previousEnd || end <= start) return false;
    previousEnd = end;
  }
  return ["breakfast", "lunch", "dinner"].every((type) => sorted.some((item) => item.blockType === type));
}

export function insertScheduledActivity(
  day: ItineraryDay,
  insertionIndex: number,
  activity: ItineraryItem,
): ItineraryDay | undefined {
  if (!hasValidDailySchedule(day) || !Number.isInteger(insertionIndex)
    || insertionIndex < 0 || insertionIndex > day.items.length
    || !Number.isInteger(activity.durationMinutes) || activity.durationMinutes < 1) return undefined;

  const previous = day.items[insertionIndex - 1];
  const next = day.items[insertionIndex];
  const start = previous
    ? minutes(previous.endTime ?? "") + (next ? Math.max(0, minutes(next.startTime ?? "") - minutes(previous.endTime ?? "")) : 15)
    : next ? Math.max(0, minutes(next.startTime ?? "") - activity.durationMinutes) : 9 * 60;
  const insertedEnd = start + activity.durationMinutes;
  if (start < 0 || insertedEnd > 23 * 60 + 59) return undefined;

  let requiredStart = insertedEnd + 15;
  const items: ItineraryItem[] = [];
  for (const [index, item] of day.items.entries()) {
    if (index < insertionIndex) {
      items.push(item);
      continue;
    }
    const originalStart = minutes(item.startTime ?? "");
    const shiftedStart = Math.max(originalStart, requiredStart);
    const shiftedEnd = shiftedStart + item.durationMinutes;
    if (shiftedEnd > 23 * 60 + 59) return undefined;
    const result = { ...item, startTime: timeLabel(shiftedStart), endTime: timeLabel(shiftedEnd) };
    requiredStart = shiftedEnd + 15;
    items.push(result);
  }
  const inserted = {
    ...activity,
    startTime: timeLabel(start),
    endTime: timeLabel(insertedEnd),
    order: insertionIndex + 1,
  };
  items.splice(insertionIndex, 0, inserted);
  const orderedItems = items.map((item, index) => ({ ...item, order: index + 1 }));
  if (orderedItems.length !== day.items.length + 1) return undefined;
  if (!hasValidDailySchedule({ ...day, items: orderedItems })) return undefined;
  return { ...day, items: orderedItems };
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
  if (end > 23 * 60 + 59) return undefined;
  return timeLabel(end);
}

export function durationBetween(startTime: string, endTime: string): number | undefined {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start === undefined || end === undefined || end <= start ? undefined : end - start;
}

export function proposeActivitySchedule(items: ItineraryItem[]): ItineraryItem[] | undefined {
  if (items.some((item) => !item.startTime || !item.endTime
    || durationBetween(item.startTime, item.endTime) !== item.durationMinutes
    || !Number.isInteger(item.durationMinutes) || item.durationMinutes < 1)) return undefined;
  const original = [...items].sort((left, right) => minutes(left.startTime!) - minutes(right.startTime!));
  const gaps = new Map<string, number>();
  for (let index = 0; index < original.length - 1; index += 1) {
    gaps.set(original[index].id, Math.max(0, minutes(original[index + 1].startTime!) - minutes(original[index].endTime!)));
  }
  let cursor = original.length ? minutes(original[0].startTime!) : 9 * 60;
  const proposed: ItineraryItem[] = [];
  for (const item of items) {
    const start = cursor;
    const end = start + item.durationMinutes;
    cursor = end + (gaps.get(item.id) ?? 0);
    if (end > 23 * 60 + 59) return undefined;
    proposed.push({ ...item, startTime: timeLabel(start), endTime: timeLabel(end) });
  }
  return proposed.map((item, index) => ({ ...item, order: index + 1 }));
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
