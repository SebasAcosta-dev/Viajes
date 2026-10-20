import { describe, expect, it } from "vitest";
import { destinations } from "@/app/data/demo-data";
import { generateItineraryFromTrip, getTripBudgetSummary } from "@/app/lib/itinerary";

describe("generateItineraryFromTrip", () => {
  it("genera un itinerario con días y actividades", () => {
    const itinerary = generateItineraryFromTrip(destinations[0], {
      origin: "Madrid",
      destination: "Marrakech",
      startDate: "2026-04-12",
      endDate: "2026-04-14",
      travelers: 2,
      budget: 800,
      currency: "EUR",
      interests: ["Cultura"],
      travelType: "Cultural",
      pace: "equilibrado",
      notes: "",
    });

    expect(itinerary).toHaveLength(3);
    expect(itinerary[0].items.length).toBeGreaterThan(0);
    expect(new Set(itinerary.flatMap((day) => day.items.map((item) => item.name))).size)
      .toBe(itinerary.flatMap((day) => day.items).length);
    expect(itinerary.flatMap((day) => day.items).every((item) => item.source === "orientativo")).toBe(true);
    expect(itinerary.map((day) => day.date)).toEqual(["2026-04-12", "2026-04-13", "2026-04-14"]);
  });

  it("usa la moneda seleccionada en la actividad de reserva", () => {
    const destinationWithoutPlaces = { ...destinations[0], places: [] };
    const itinerary = generateItineraryFromTrip(destinationWithoutPlaces, {
      origin: "Madrid",
      destination: "Marrakech",
      startDate: "2026-04-12",
      endDate: "2026-04-12",
      travelers: 1,
      budget: 200,
      currency: "MAD",
      interests: ["Cultura"],
      travelType: "Cultural",
      pace: "equilibrado",
      notes: "",
    });

    expect(itinerary[0].items[0].currency).toBe("MAD");
  });

  it("prioriza lugares vinculados a los intereses y calcula el total para el grupo", () => {
    const itinerary = generateItineraryFromTrip(destinations[0], {
      origin: "Madrid",
      destination: "Marrakech",
      startDate: "2026-04-12",
      endDate: "2026-04-12",
      travelers: 2,
      budget: 200,
      currency: "EUR",
      interests: ["Historia"],
      travelType: "Cultural",
      pace: "equilibrado",
      notes: "",
    });
    const activities = itinerary.flatMap((day) => day.items);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.every((item) => item.interestTags?.includes("Historia"))).toBe(true);
    expect(activities.some((item) => item.pricePerPerson === 15 && item.estimate === 30)).toBe(true);
  });
});

describe("getTripBudgetSummary", () => {
  it("calcula costes estimados por persona y por día", () => {
    const summary = getTripBudgetSummary({
      budget: 1000,
      currency: "EUR",
      travelers: 2,
      itinerary: [
        {
          id: "d1",
          dayNumber: 1,
          date: "2026-04-12",
          theme: "Día 1",
          summary: "",
          items: [{
            id: "i1",
            name: "Museo",
            description: "",
            startTime: "09:00",
            endTime: "10:00",
            durationMinutes: 60,
            estimate: 30,
            currency: "EUR",
            order: 1,
            lat: 1,
            lng: 2,
            notes: "",
            source: "verificado",
          }, {
            id: "i2",
            name: "Restaurante",
            description: "",
            startTime: "20:00",
            endTime: "21:00",
            durationMinutes: 60,
            estimate: 25,
            currency: "EUR",
            order: 2,
            lat: 1,
            lng: 2,
            notes: "",
            source: "orientativo",
          }],
        },
      ],
    });

    expect(summary.totalEstimated).toBe(55);
    expect(summary.avgPerPerson).toBe(27.5);
    expect(summary.dailyAvg).toBe(55);
    expect(summary.actualExpenses).toBe(0);
    expect(summary.remainingBudget).toBe(1000);
    expect(summary.projectedRemaining).toBe(945);
  });

  it("separa costes estimados y gastos reales y no mezcla monedas", () => {
    const summary = getTripBudgetSummary({
      budget: 100,
      currency: "EUR",
      travelers: 1,
      itinerary: [{
        id: "d1",
        dayNumber: 1,
        theme: "Día 1",
        summary: "",
        items: [
          { id: "eur", name: "Museo", description: "", durationMinutes: 60, estimate: 30, pricePerPerson: 30, priceStatus: "estimate", currency: "EUR", order: 1, notes: "", source: "orientativo" },
          { id: "usd", name: "Comida", description: "", durationMinutes: 60, estimate: 25, currency: "USD", order: 2, notes: "", source: "orientativo" },
          { id: "food", name: "Degustación", description: "", durationMinutes: 45, estimate: 40, currency: "EUR", order: 3, notes: "", source: "orientativo", budgetCategory: "gastronomy", priceStatus: "estimate" },
          { id: "unknown", name: "Visita guiada", description: "", durationMinutes: 60, currency: "EUR", order: 4, notes: "", source: "orientativo", priceStatus: "unknown" },
        ],
      }],
      expenses: [
        { amount: 20, currency: "EUR" },
        { amount: 50, currency: "USD" },
      ],
    });

    expect(summary.totalEstimated).toBe(30);
    expect(summary.actualExpenses).toBe(20);
    expect(summary.remainingBudget).toBe(80);
    expect(summary.projectedRemaining).toBe(50);
    expect(summary.unknownActivityPrices).toBe(1);
    expect(summary.projectionIncomplete).toBe(true);
  });
});
