import { describe, expect, it } from "vitest";
import { addDailySchedules, calculateScheduledEnd, hasValidDailySchedule } from "@/lib/itinerary-schedule";
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
  it("organiza las actividades entre 09:00 y 21:00 con comidas, pausas y orden sin solapamientos", () => {
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
    expect(calculateScheduledEnd("20:30", 60)).toBeUndefined();
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
});
