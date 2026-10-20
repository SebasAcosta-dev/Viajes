import { describe, expect, it } from "vitest";
import { dateInTimeZone, normalizeDateRange, normalizeNewTripDates, shiftedDateRange } from "@/app/lib/trip-dates";
import type { TripDraft } from "@/app/lib/persistence/types";

const draft: TripDraft = {
  name: "Viaje",
  destination: "Marrakech",
  startDate: "2026-10-18",
  endDate: "2026-10-20",
  travelers: 1,
  budget: 100,
  currency: "EUR",
  itinerary: [
    { id: "d1", dayNumber: 1, date: "2026-10-18", theme: "Día 1", summary: "", items: [] },
    { id: "d2", dayNumber: 2, date: "2026-10-19", theme: "Día 2", summary: "", items: [] },
    { id: "d3", dayNumber: 3, date: "2026-10-20", theme: "Día 3", summary: "", items: [] },
  ],
};

describe("fechas de viajes", () => {
  it("mantiene las fechas date-only en el día local correspondiente, sin conversión UTC", () => {
    const instant = new Date("2026-10-20T01:00:00.000Z");
    expect(dateInTimeZone(instant, "Pacific/Honolulu")).toBe("2026-10-19");
    expect(dateInTimeZone(instant, "Europe/Madrid")).toBe("2026-10-20");
  });

  it("ajusta el regreso si queda antes de la salida", () => {
    expect(normalizeDateRange("2026-10-22", "2026-10-20")).toEqual({
      startDate: "2026-10-22",
      endDate: "2026-10-22",
    });
  });

  it("mueve un viaje nuevo con salida pasada al día actual y conserva sus jornadas", () => {
    const normalized = normalizeNewTripDates(draft, "2026-10-20");
    expect(normalized.startDate).toBe("2026-10-20");
    expect(normalized.endDate).toBe("2026-10-22");
    expect(normalized.itinerary.map((day) => day.date)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
    ]);
  });

  it("asigna fechas actuales coherentes a un viaje nuevo sin fechas", () => {
    const undated = { ...draft, startDate: undefined, endDate: undefined, itinerary: draft.itinerary.map((day) => ({ ...day, date: undefined })) };
    const normalized = normalizeNewTripDates(undated, "2026-10-20");
    expect(normalized.startDate).toBe("2026-10-20");
    expect(normalized.endDate).toBe("2026-10-22");
    expect(normalized.itinerary.map((day) => day.date)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
    ]);
  });

  it("desplaza un intervalo sin cambiar de día por zona horaria", () => {
    expect(shiftedDateRange("2026-10-18", "2026-10-20", "2026-10-20")).toEqual({
      startDate: "2026-10-20",
      endDate: "2026-10-22",
    });
  });

  it("ajusta las fechas pasadas de una nueva copia al intervalo actual", () => {
    const historical = { ...draft, startDate: "2020-01-01", endDate: "2020-01-03" };
    expect(normalizeNewTripDates(historical, "2026-10-20")).toMatchObject({
      startDate: "2026-10-20",
      endDate: "2026-10-22",
    });
  });
});
