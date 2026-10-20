import { describe, expect, it } from "vitest";
import { validateActivityUpdate, validateExpense, validateTripDraft } from "@/app/lib/persistence/validation";

const validDraft = {
  name: "Marrakech",
  destination: "Marrakech",
  budget: 200,
  currency: "EUR",
  itinerary: [{
    id: "day-1",
    dayNumber: 1,
    theme: "Medina",
    summary: "",
    items: [{
      id: "activity-1",
      name: "Paseo",
      description: "",
      durationMinutes: 60,
      currency: "EUR",
      order: 1,
      notes: "Orientativo",
      source: "orientativo",
    }],
  }],
};

describe("validación de persistencia", () => {
  it("permite fechas y costes desconocidos sin inventarlos", () => {
    const draft = validateTripDraft(validDraft);
    expect(draft?.startDate).toBeUndefined();
    expect(draft?.itinerary[0].items[0].estimate).toBeUndefined();
  });

  it("rechaza campos numéricos enviados como texto y días no consecutivos", () => {
    expect(validateTripDraft({ ...validDraft, budget: "200" })).toBeUndefined();
    expect(validateTripDraft({
      ...validDraft,
      itinerary: [{ ...validDraft.itinerary[0], dayNumber: 2 }],
    })).toBeUndefined();
  });

  it("rechaza viajeros fraccionarios y fechas que no cubren los días guardados", () => {
    expect(validateTripDraft({ ...validDraft, travelers: 1.5 })).toBeUndefined();
    expect(validateTripDraft({
      ...validDraft,
      startDate: "2026-10-19",
      endDate: "2026-10-20",
    })).toBeUndefined();
    expect(validateTripDraft({
      ...validDraft,
      startDate: "2026-10-19",
      endDate: "2026-10-19",
      itinerary: [{
        ...validDraft.itinerary[0],
        date: "2026-10-20",
      }],
    })).toBeUndefined();
  });

  it("valida precio por persona, total de viajeros y etiquetas ligadas a los intereses", () => {
    const item = {
      ...validDraft.itinerary[0].items[0],
      pricePerPerson: 10,
      priceStatus: "estimate",
      estimate: 30,
      interestTags: ["Fútbol"],
      budgetCategory: "activity",
    };
    const withTripContext = {
      ...validDraft,
      travelers: 3,
      interests: ["Fútbol"],
      itinerary: [{ ...validDraft.itinerary[0], items: [item] }],
    };
    expect(validateTripDraft(withTripContext)).toBeDefined();
    expect(validateTripDraft({
      ...withTripContext,
      itinerary: [{ ...validDraft.itinerary[0], items: [{ ...item, estimate: 10 }] }],
    })).toBeUndefined();
    expect(validateTripDraft({
      ...withTripContext,
      itinerary: [{ ...validDraft.itinerary[0], items: [{ ...item, interestTags: ["Historia"] }] }],
    })).toBeUndefined();
    expect(validateTripDraft({
      ...withTripContext,
      itinerary: [{ ...validDraft.itinerary[0], items: [{
        ...item,
        priceStatus: "unknown",
        estimate: undefined,
        pricePerPerson: undefined,
      }] }],
    })).toBeDefined();
  });

  it("valida importes, fechas y moneda de los gastos", () => {
    expect(validateExpense({
      category: "Comida",
      description: "Almuerzo",
      amount: 12.5,
      currency: "EUR",
      incurredOn: "2026-10-19",
    })).toMatchObject({ amount: 12.5, currency: "EUR" });
    expect(validateExpense({
      category: "Comida",
      description: "Almuerzo",
      amount: "12.5",
      currency: "EUR",
      incurredOn: "2026-10-19",
    })).toBeUndefined();
    expect(validateExpense({
      category: "Comida",
      description: "Almuerzo",
      amount: 12.5,
      currency: "XYZ",
      incurredOn: "2026-02-30",
    })).toBeUndefined();
  });

  it("valida ediciones de precio sin convertir desconocido en gratis", () => {
    expect(validateActivityUpdate({
      name: "Museo",
      description: "",
      durationMinutes: 60,
      estimate: 40,
      pricePerPerson: 20,
      priceStatus: "estimate",
    })).toMatchObject({ estimate: 40, pricePerPerson: 20, priceStatus: "estimate" });
    expect(validateActivityUpdate({
      name: "Museo",
      description: "",
      durationMinutes: 60,
      priceStatus: "unknown",
    })).toMatchObject({ priceStatus: "unknown" });
    expect(validateActivityUpdate({
      name: "Museo",
      description: "",
      durationMinutes: 60,
      estimate: 0,
      priceStatus: "free_verified",
    })).toMatchObject({ estimate: 0, priceStatus: "free_verified" });
    expect(validateActivityUpdate({
      name: "Museo",
      description: "",
      durationMinutes: 60,
      estimate: 25,
      pricePerPerson: 25,
      priceStatus: "verified",
    })).toMatchObject({ priceStatus: "verified" });
  });
});
