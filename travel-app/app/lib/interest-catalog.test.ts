import { describe, expect, it } from "vitest";
import { allTravelInterests, interestCategories, resolveTripInterests } from "@/app/lib/interest-catalog";

describe("catálogo de intereses de viaje", () => {
  it("incluye las categorías solicitadas y una lista amplia de opciones", () => {
    expect(interestCategories).toHaveLength(16);
    expect(allTravelInterests).toContain("Fútbol");
    expect(allTravelInterests).toContain("Mezquitas");
    expect(allTravelInterests).toContain("Mercados tradicionales");
    expect(allTravelInterests.length).toBeGreaterThan(100);
  });

  it("prioriza intereses concretos del viaje sobre los del perfil y permite selecciones múltiples", () => {
    expect(resolveTripInterests(["Fútbol", "Arquitectura"], ["Historia"], ["Pádel"]))
      .toEqual(["Fútbol", "Arquitectura", "Pádel"]);
    expect(resolveTripInterests([], ["Historia"], [])).toEqual(["Historia"]);
  });
});
