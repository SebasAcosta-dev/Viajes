import { describe, expect, it } from "vitest";
import { analyzeTripGroupDates } from "@/features/trips/components/combined-trip-planner";
import type { SavedTrip } from "@/lib/persistence/types";

const trip = (id: string, startDate: string | null, endDate: string | null): SavedTrip => ({
  id, name: id, origin: "", destination: id, startDate, endDate, travelers: 1,
  budget: 0, currency: "EUR", interests: [], travelType: "Combinado", status: "planificado",
  itinerary: [], expenses: [], createdAt: "", updatedAt: "",
});

describe("análisis de fechas de viaje combinado", () => {
  it("detecta periodos solapados y huecos sin inventar fechas ausentes", () => {
    const items = [
      { tripId: "a", sortOrder: 1, startDate: "2026-10-01", endDate: "2026-10-04", trip: trip("a", "2026-10-01", "2026-10-04") },
      { tripId: "b", sortOrder: 2, startDate: "2026-10-06", endDate: "2026-10-08", trip: trip("b", "2026-10-06", "2026-10-08") },
      { tripId: "c", sortOrder: 3, startDate: "2026-10-08", endDate: "2026-10-09", trip: trip("c", "2026-10-08", "2026-10-09") },
    ];
    expect(analyzeTripGroupDates(items)).toEqual([
      { beforeTripId: "a", afterTripId: "b", kind: "gap", days: 1 },
      { beforeTripId: "b", afterTripId: "c", kind: "overlap", days: 1 },
    ]);
  });

  it("no marca huecos si una de las fechas falta", () => {
    expect(analyzeTripGroupDates([
      { tripId: "a", sortOrder: 1, startDate: null, endDate: null, trip: trip("a", null, null) },
      { tripId: "b", sortOrder: 2, startDate: "2026-10-02", endDate: "2026-10-03", trip: trip("b", "2026-10-02", "2026-10-03") },
    ])).toEqual([]);
  });
});
