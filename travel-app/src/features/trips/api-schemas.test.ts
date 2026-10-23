import { describe, expect, it } from "vitest";
import { reorderActivitiesRequestSchema, tripGroupRequestSchema, tripUpdateSchema } from "@/features/trips/api-schemas";

describe("contratos API de viajes", () => {
  it("conserva fechas opcionales nulas al validar grupos", () => {
    const result = tripGroupRequestSchema.safeParse({
      name: "Ruta",
      items: [{ tripId: "11111111-1111-4111-8111-111111111111", startDate: null, endDate: null }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items[0]).toMatchObject({ startDate: null, endDate: null });
  });

  it("rechaza fechas invertidas y viajes repetidos en grupos", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(tripGroupRequestSchema.safeParse({
      name: "Ruta",
      items: [{ tripId: id, startDate: "2026-10-22", endDate: "2026-10-21" }],
    }).success).toBe(false);
    expect(tripGroupRequestSchema.safeParse({
      name: "Ruta",
      items: [
        { tripId: id, startDate: null, endDate: null },
        { tripId: id, startDate: null, endDate: null },
      ],
    }).success).toBe(false);
  });

  it("rechaza objetos desconocidos y actualizaciones vacías", () => {
    expect(tripUpdateSchema.safeParse({ status: "activo", unexpected: true }).success).toBe(false);
    expect(tripUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza ids de actividad duplicados en un reordenamiento", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(reorderActivitiesRequestSchema.safeParse({ activityIds: [id, id] }).success).toBe(false);
  });
});
