import { describe, expect, it } from "vitest";
import { addDailySchedules, calculateScheduledEnd, durationBetween, hasValidDailySchedule, insertScheduledActivity, moveItineraryActivity, proposeActivitySchedule } from "@/lib/itinerary-schedule";
import { getTripBudgetSummary } from "@/lib/itinerary";
import type { ItineraryDay } from "@/lib/types";

const day: ItineraryDay = {
  id: "day-1",
  dayNumber: 1,
  date: "2026-10-20",
  theme: "Centro histórico",
  summary: "",
  items: [
    {
      id: "visit-1",
      name: "Museo",
      description: "Visita interior.",
      durationMinutes: 120,
      estimate: 60,
      pricePerPerson: 30,
      priceStatus: "estimate",
      budgetCategory: "activity",
      currency: "EUR",
      order: 1,
      notes: "Estimación.",
      source: "orientativo",
      reliability: "unknown",
      location: "Centro",
    },
    {
      id: "travel-1",
      name: "Traslado al casco antiguo",
      description: "Tiempo aproximado de traslado.",
      durationMinutes: 30,
      travelMinutes: 30,
      blockType: "travel",
      currency: "EUR",
      order: 2,
      notes: "Trayecto no verificado.",
      source: "orientativo",
      reliability: "unknown",
    },
    {
      id: "visit-2",
      name: "Paseo guiado",
      description: "Ruta a pie.",
      durationMinutes: 90,
      currency: "EUR",
      order: 3,
      notes: "",
      source: "orientativo",
    },
  ],
};

describe("horario diario", () => {
  it("comparte el movimiento de actividades entre el borrador y los viajes guardados", () => {
    const moved = moveItineraryActivity(day.items, "travel-1", "visit-1");
    expect(moved.map((item) => [item.id, item.order])).toEqual([["travel-1", 1], ["visit-1", 2], ["visit-2", 3]]);
    expect(moveItineraryActivity(day.items, "missing", "visit-1")).toBe(day.items);
  });

  it("organiza las actividades con comidas, pausas y orden sin solapamientos", () => {
    const scheduled = addDailySchedules([day]);
    expect(scheduled).toHaveLength(1);
    expect(hasValidDailySchedule(scheduled![0])).toBe(true);
    expect(scheduled![0].items.map((item) => item.startTime)).toEqual(
      [...scheduled![0].items.map((item) => item.startTime)].sort(),
    );
    expect(scheduled![0].items.map((item) => item.blockType)).toEqual(expect.arrayContaining([
      "breakfast", "lunch", "dinner", "activity", "travel", "free_time",
    ]));
    for (let index = 1; index < scheduled![0].items.length; index += 1) {
      expect(scheduled![0].items[index].startTime! >= scheduled![0].items[index - 1].endTime!).toBe(true);
    }
    expect(scheduled![0].items.every((item) =>
      item.durationMinutes === Number(item.endTime!.slice(0, 2)) * 60 + Number(item.endTime!.slice(3, 5))
        - Number(item.startTime!.slice(0, 2)) * 60 - Number(item.startTime!.slice(3, 5)),
    )).toBe(true);
  });

  it("no inventa una ruta cuando las actividades no caben en el horario disponible", () => {
    const tooLong = {
      ...day,
      items: [{ ...day.items[0], durationMinutes: 700 }],
    };
    expect(addDailySchedules([tooLong])).toBeUndefined();
  });

  it("mantiene fuera del presupuesto las comidas, trayectos y tiempo libre", () => {
    const scheduled = addDailySchedules([day])!;
    const summary = getTripBudgetSummary({
      budget: 200,
      currency: "EUR",
      travelers: 2,
      itinerary: scheduled,
    });
    expect(summary.totalEstimated).toBe(60);
    expect(summary.unknownActivityPrices).toBe(1);
    expect(summary.projectionIncomplete).toBe(true);
  });

  it("mantiene consultables bloques antiguos sin hora y calcula el nuevo final al editar duración", () => {
    expect(addDailySchedules([day])?.[0].items.some((item) => item.blockType === "lunch")).toBe(true);
    expect(calculateScheduledEnd("10:00", 90)).toBe("11:30");
    expect(calculateScheduledEnd("20:30", 60)).toBe("21:30");
    expect(calculateScheduledEnd("07:30", 45)).toBe("08:15");
    expect(calculateScheduledEnd("22:30", 60)).toBe("23:30");
    expect(durationBetween("10:00", "12:00")).toBe(120);
    expect(durationBetween("23:00", "00:30")).toBeUndefined();
  });

  it("preserva un horario existente sin reordenar ni modificar su secuencia", () => {
    const scheduled = addDailySchedules([day])![0];
    const result = addDailySchedules([scheduled])![0];
    expect(result.items.map((item) => item.id)).toEqual(scheduled.items.map((item) => item.id));
  });

  it("conserva las horas válidas recibidas aunque el modelo no haya incluido comidas", () => {
    const timed = {
      ...day,
      items: [{
        ...day.items[0],
        startTime: "10:00",
        endTime: "12:00",
        durationMinutes: 120,
      }],
    };
    const scheduled = addDailySchedules([timed])?.[0];
    expect(scheduled?.items.find((item) => item.blockType === "activity")).toMatchObject({
      startTime: "10:00",
      endTime: "12:00",
    });
    expect(hasValidDailySchedule(scheduled!)).toBe(true);
  });

  it("inserta una actividad antes de otra y desplaza la jornada sin perder identificadores", () => {
    const scheduledDay = {
      ...day,
      items: [
        { ...day.items[0], id: "breakfast", name: "Desayuno libre", blockType: "breakfast" as const, startTime: "09:00", endTime: "09:45", durationMinutes: 45, order: 1 },
        { ...day.items[1], name: "Basílica de Gesù", blockType: "activity" as const, startTime: "10:00", endTime: "11:15", durationMinutes: 75, order: 2 },
        { ...day.items[2], id: "lunch", name: "Almuerzo", blockType: "lunch" as const, startTime: "13:00", endTime: "14:00", durationMinutes: 60, order: 3 },
        { ...day.items[2], id: "dinner", name: "Cena", blockType: "dinner" as const, startTime: "19:00", endTime: "20:00", durationMinutes: 60, order: 4 },
      ],
    };
    const inserted = insertScheduledActivity(scheduledDay, 1, {
      id: "walk",
      name: "Paseo por el centro",
      description: "",
      blockType: "activity",
      durationMinutes: 30,
      currency: "EUR",
      order: 2,
      notes: "",
      source: "desconocido",
      priceStatus: "unknown",
    });

    expect(inserted?.items.map(({ name, startTime, endTime }) => [name, startTime, endTime])).toEqual([
      ["Desayuno libre", "09:00", "09:45"],
      ["Paseo por el centro", "10:00", "10:30"],
      ["Basílica de Gesù", "10:45", "12:00"],
      ["Almuerzo", "13:00", "14:00"],
      ["Cena", "19:00", "20:00"],
    ]);
    expect(inserted?.items.map((item) => item.id)).toContain("travel-1");
    expect(hasValidDailySchedule(inserted!)).toBe(true);
  });

  it("acepta actividades después de las 21:00 y rechaza las que exceden el día representable", () => {
    const full = {
      ...day,
      items: [
        { ...day.items[0], id: "breakfast", blockType: "breakfast" as const, startTime: "09:00", endTime: "09:45", durationMinutes: 45 },
        { ...day.items[2], id: "lunch", blockType: "lunch" as const, startTime: "13:00", endTime: "14:00", durationMinutes: 60 },
        { ...day.items[2], id: "dinner", blockType: "dinner" as const, startTime: "19:00", endTime: "19:45", durationMinutes: 45 },
        { ...day.items[1], blockType: "activity" as const, startTime: "20:00", endTime: "21:00", durationMinutes: 60 },
      ],
    };
    expect(insertScheduledActivity(full, 3, {
      id: "late",
      name: "Actividad larga",
      description: "",
      durationMinutes: 30,
      currency: "EUR",
      order: 4,
      notes: "",
      source: "desconocido",
    })?.items.find((item) => item.id === "late")).toMatchObject({ startTime: "20:00", endTime: "20:30" });
    expect(insertScheduledActivity(full, 3, {
      id: "too-late", name: "No cabe", description: "", durationMinutes: 1440,
      currency: "EUR", order: 4, notes: "", source: "desconocido",
    })).toBeUndefined();
  });

  it("propone reordenar manteniendo duraciones y huecos sin imponer el límite de las 21:00", () => {
    const items = [
      { ...day.items[0], id: "early", name: "Desayuno", startTime: "07:30", endTime: "08:15", durationMinutes: 45 },
      { ...day.items[1], id: "late", name: "Cena", startTime: "22:00", endTime: "23:00", durationMinutes: 60 },
    ];
    const proposed = proposeActivitySchedule(items);
    expect(proposed?.map((item) => [item.name, item.startTime, item.endTime])).toEqual([
      ["Desayuno", "07:30", "08:15"],
      ["Cena", "22:00", "23:00"],
    ]);
    expect(proposeActivitySchedule([...items, { ...items[1], id: "overflow", startTime: "23:10", endTime: "23:59", durationMinutes: 120 }])).toBeUndefined();
  });
});
