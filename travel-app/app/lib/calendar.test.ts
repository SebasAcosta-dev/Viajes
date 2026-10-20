import { describe, expect, it } from "vitest";
import { getCalendarEntries, getMonthDates, getWeekDates } from "@/app/lib/calendar";
import type { SavedTrip } from "@/app/lib/persistence/types";

const trip: SavedTrip = {
  id: "trip-1",
  name: "Viaje",
  origin: "Madrid",
  destination: "Marrakech",
  startDate: "2026-10-19",
  endDate: "2026-10-21",
  travelers: 1,
  budget: 100,
  currency: "EUR",
  interests: [],
  travelType: "Cultural",
  status: "planificado",
  itinerary: [{
    id: "day-1",
    dayNumber: 1,
    theme: "Medina",
    summary: "",
    items: [{
      id: "activity-1",
      name: "Museo",
      description: "",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      currency: "EUR",
      order: 1,
      notes: "",
      source: "orientativo",
    }],
  }],
  expenses: [],
  createdAt: "",
  updatedAt: "",
};

describe("fechas del calendario", () => {
  it("genera cuadrículas de mes y semana en orden ISO sin depender de la zona horaria", () => {
    expect(getMonthDates("2026-10")).toHaveLength(42);
    expect(getMonthDates("2026-10")[0]).toBe("2026-09-28");
    expect(getWeekDates("2026-10-20")).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22",
      "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
  });

  it("muestra los días generales de viaje y las actividades con hora cuando existen", () => {
    const entries = getCalendarEntries([trip]);
    expect(entries.filter((entry) => entry.kind === "trip")).toHaveLength(3);
    expect(entries.find((entry) => entry.kind === "activity")).toMatchObject({
      date: "2026-10-19",
      label: "Museo",
      startTime: "10:00",
    });
  });
});
