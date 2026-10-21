import { describe, expect, it } from "vitest";
import { activityUpdateRequestSchema } from "@/features/itinerary/api-schemas";

describe("contrato API de edición de actividades", () => {
  it("acepta actualizaciones válidas de actividad", () => {
    expect(activityUpdateRequestSchema.safeParse({
      name: "Museo",
      description: "Visita guiada",
      durationMinutes: 90,
      estimate: 12.34,
      currency: "EUR",
      priceStatus: "estimate",
    }).success).toBe(true);
  });

  it("rechaza duraciones inválidas e importes negativos", () => {
    expect(activityUpdateRequestSchema.safeParse({ name: "Museo", description: "", durationMinutes: 0 }).success).toBe(false);
    expect(activityUpdateRequestSchema.safeParse({
      name: "Museo",
      description: "Visita guiada",
      durationMinutes: 90,
      estimate: -1,
      currency: "EUR",
    }).success).toBe(false);
  });
});
