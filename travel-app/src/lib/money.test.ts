import { describe, expect, it } from "vitest";
import { addMinorUnits, fromMinorUnits, sumMinorUnitsForCurrency, toMinorUnits } from "@/lib/money";

describe("importe monetario en unidades menores", () => {
  it.each(["EUR", "USD", "GBP", "MAD"] as const)("convierte %s sin perder centavos", (currency) => {
    expect(toMinorUnits(12.34, currency)).toBe(1234);
    expect(fromMinorUnits(1234, currency)).toBe(12.34);
  });

  it("redondea como numeric(12,2), incluidos los empates positivos", () => {
    expect(toMinorUnits(1.005, "EUR")).toBe(101);
    expect(toMinorUnits(1.004, "EUR")).toBe(100);
  });

  it("no admite importes negativos ni unidades menores fraccionarias", () => {
    expect(() => toMinorUnits(-0.01, "USD")).toThrow("no puede ser negativo");
    expect(() => fromMinorUnits(1.5, "USD")).toThrow("no es válido");
  });

  it("solo suma registros de la moneda solicitada", () => {
    const expenses = [
      { amount: 12.34, currency: "EUR" as const },
      { amount: 5.67, currency: "EUR" as const },
      { amount: 100, currency: "USD" as const },
    ];
    expect(sumMinorUnitsForCurrency(expenses, "EUR")).toBe(1801);
    expect(addMinorUnits(toMinorUnits(12.34, "EUR"), toMinorUnits(5.67, "EUR"))).toBe(1801);
  });
});
