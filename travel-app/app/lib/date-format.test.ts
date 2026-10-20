import { describe, expect, it } from "vitest";
import { addIsoDays, formatIsoDate, formatTripPeriod } from "@/app/lib/date-format";

describe("formato de fechas de viaje", () => {
  it("muestra fechas ISO en español sin desplazamiento de zona horaria", () => {
    expect(formatIsoDate("2026-10-20")).toBe("20 de octubre de 2026");
    expect(formatTripPeriod("2026-10-20", "2026-10-23")).toBe("20 de octubre de 2026 – 23 de octubre de 2026");
  });

  it("mantiene una fecha heredada inválida visible en vez de cambiarla", () => {
    expect(formatIsoDate("fecha antigua")).toBe("fecha antigua");
    expect(formatTripPeriod(null, null)).toBe("Fechas pendientes");
    expect(addIsoDays("fecha antigua", 1)).toBeUndefined();
    expect(addIsoDays("2026-10-20", 3)).toBe("2026-10-23");
  });
});
