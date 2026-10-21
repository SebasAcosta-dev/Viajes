import { describe, expect, it } from "vitest";
import { expenseRequestSchema } from "@/features/budget/api-schemas";

describe("contrato API de gastos", () => {
  const expense = {
    category: "Comida",
    description: "Cena",
    amount: 12.34,
    currency: "EUR",
    incurredOn: "2026-10-21",
  };

  it("acepta un gasto no negativo con moneda y fecha válidas", () => {
    expect(expenseRequestSchema.safeParse(expense).success).toBe(true);
  });

  it("rechaza importes negativos y fechas no válidas", () => {
    expect(expenseRequestSchema.safeParse({ ...expense, amount: -0.01 }).success).toBe(false);
    expect(expenseRequestSchema.safeParse({ ...expense, incurredOn: "2026-02-30" }).success).toBe(false);
  });
});
