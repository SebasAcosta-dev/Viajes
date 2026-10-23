import { describe, expect, it } from "vitest";
import { addMinorUnits, formatMoney, fromMinorUnits, sumMinorUnitsForCurrency, toMinorUnits } from "@/lib/money";

describe("importe monetario en unidades menores", () => {
  it.each(["EUR", "COP", "USD", "GBP", "CHF", "MXN", "ARS", "PEN", "BRL", "CAD", "AUD"] as const)("convierte %s sin perder centavos", (currency) => {
    expect(toMinorUnits(12.34, currency)).toBe(1234);
    expect(fromMinorUnits(1234, currency)).toBe(12.34);
  });

  it.each(["JPY", "CLP"] as const)("usa unidades enteras para %s", (currency) => {
    expect(toMinorUnits(1234, currency)).toBe(1234);
    expect(toMinorUnits(1234.5, currency)).toBe(1235);
    expect(fromMinorUnits(1234, currency)).toBe(1234);
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

  it("formatea COP con sus dos decimales ISO y JPY sin decimales", () => {
    expect(formatMoney(12345.5, "COP")).toContain("12.345,50");
    expect(formatMoney(1234, "JPY")).not.toMatch(/[,\.]\d{2}/);
  });
});
