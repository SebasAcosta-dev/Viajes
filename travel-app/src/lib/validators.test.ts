import { describe, expect, it } from "vitest";
import { calculateBudgetBreakdown, reorderItineraryItems, validateFavoriteTarget, validateTripForm } from "@/lib/validators";
import { addIsoDays } from "@/lib/date-format";
import { localTodayIso } from "@/lib/trip-dates";

describe("validateTripForm", () => {
  it("acepta un formulario válido", () => {
    const errors = validateTripForm({
      origin: "Madrid",
      destination: "Marrakech",
      startDate: localTodayIso(),
      endDate: addIsoDays(localTodayIso(), 4) ?? localTodayIso(),
      travelers: 2,
      budget: 800,
      currency: "EUR",
      interests: ["Cultura", "Gastronomía"],
      travelType: "Cultural",
      pace: "equilibrado",
      notes: "",
    });

    expect(errors).toHaveLength(0);
  });

  it("detecta fechas y presupuesto inválidos", () => {
    const errors = validateTripForm({
      origin: "Madrid",
      destination: "",
      startDate: addIsoDays(localTodayIso(), 4) ?? localTodayIso(),
      endDate: localTodayIso(),
      travelers: 0,
      budget: 0,
      currency: "EUR",
      interests: [],
      travelType: "Económico",
      pace: "lento",
      notes: "",
    });

    expect(errors).toEqual(expect.arrayContaining([
      "El destino es obligatorio.",
      "La fecha de regreso no puede ser anterior a la de salida.",
      "El número de viajeros debe ser un entero entre 1 y 100.",
      "El presupuesto debe ser mayor que cero.",
      "Selecciona al menos un interés.",
    ]));
  });

  it("rechaza fechas imposibles y cantidades fraccionarias de viajeros", () => {
    const errors = validateTripForm({
      origin: "Madrid",
      destination: "Marrakech",
      startDate: "2026-02-30",
      endDate: "2026-03-02",
      travelers: 1.5,
      budget: 100,
      currency: "EUR",
      interests: ["Cultura"],
      travelType: "Cultural",
      pace: "equilibrado",
      notes: "",
    });
    expect(errors).toContain("La fecha de salida no es válida.");
    expect(errors).toContain("El número de viajeros debe ser un entero entre 1 y 100.");
  });

  it("rechaza una fecha de salida anterior al día actual al crear un viaje", () => {
    const errors = validateTripForm({
      origin: "Madrid",
      destination: "Marrakech",
      startDate: "2020-01-01",
      endDate: "2020-01-02",
      travelers: 1,
      budget: 100,
      currency: "EUR",
      interests: ["Historia"],
      travelType: "Cultural",
      pace: "equilibrado",
      notes: "",
    });

    expect(errors).toContain("La fecha de salida no puede ser anterior al día actual.");
  });
});

describe("calculateBudgetBreakdown", () => {
  it("distribuye el presupuesto por categorías", () => {
    const breakdown = calculateBudgetBreakdown(1000);

    expect(breakdown.transportation).toBe(200);
    expect(breakdown.accommodation).toBe(350);
    expect(breakdown.meals).toBe(150);
    expect(breakdown.activities).toBe(120);
  });
});

describe("reorderItineraryItems", () => {
  it("reordena dos actividades", () => {
    const reordered = reorderItineraryItems([
      { id: "a", order: 1 },
      { id: "b", order: 2 },
      { id: "c", order: 3 },
    ], "a", "c");

    expect(reordered.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(reordered.map((item) => item.order)).toEqual([1, 2, 3]);
  });
});

describe("validateFavoriteTarget", () => {
  it("valida un favorito correcto", () => {
    expect(validateFavoriteTarget({ type: "destination", targetId: "abc" })).toEqual([]);
  });

  it("rechaza un target inválido", () => {
    expect(validateFavoriteTarget({ type: "unknown", targetId: "" })).toEqual(expect.arrayContaining([
      "El tipo de favorito no es válido.",
      "El identificador del favorito es obligatorio.",
    ]));
  });
});
