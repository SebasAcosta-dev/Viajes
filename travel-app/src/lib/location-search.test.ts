import { describe, expect, it } from "vitest";
import {
  combineLocationSuggestions,
  normalizeLocationQuery,
  popularLocations,
  searchPopularLocations,
} from "@/lib/location-search";

describe("catálogo y búsqueda local de lugares", () => {
  it("incluye los destinos iniciales solicitados", () => {
    expect(popularLocations.map(({ name }) => name)).toEqual([
      "Barcelona", "Madrid", "París", "Londres", "Roma", "Lisboa", "Ámsterdam", "Berlín",
      "Praga", "Viena", "Atenas", "Estambul", "Marrakech", "Nueva York", "Miami", "Tokio",
      "Bangkok", "Bogotá", "Medellín", "Cartagena de Indias", "Ciudad de México", "Buenos Aires",
      "Lima", "Santiago de Chile",
    ]);
  });

  it.each([
    ["bar", "Barcelona"],
    ["bog", "Bogotá"],
    ["miam", "Miami"],
    ["new yor", "Nueva York"],
    ["paris", "París"],
    ["amsterdam", "Ámsterdam"],
    ["tokyo", "Tokio"],
  ])("busca %s sin depender de tildes o idioma", (query, expected) => {
    expect(searchPopularLocations(query).map(({ name }) => name)).toContain(expected);
  });

  it("normaliza mayúsculas, espacios y diacríticos", () => {
    expect(normalizeLocationQuery("  MÉDELLÍN ")).toBe("medellin");
  });

  it("combina el catálogo local con resultados remotos, prioriza coincidencias y deduplica", () => {
    const local = searchPopularLocations("bar");
    const remote = [
      { key: "barcelona-remote", name: "Barcelona", country: "España", source: "geoapify" as const },
      { key: "barcelona-us", name: "Bar Harbor", country: "Estados Unidos", source: "geoapify" as const },
    ];

    const results = combineLocationSuggestions("bar", local, remote);

    expect(results[0]?.name).toBe("Barcelona");
    expect(results.filter(({ name }) => name === "Barcelona")).toHaveLength(1);
    expect(results.map(({ name }) => name)).toContain("Bar Harbor");
    expect(combineLocationSuggestions("bar", [...local, ...remote], [], 1)).toHaveLength(1);
  });

  it("mantiene localidades homónimas cuando cambia la región o el país", () => {
    const results = combineLocationSuggestions("springfield", [], [
      { key: "springfield-us-il", name: "Springfield", country: "United States", region: "Illinois", source: "geoapify" },
      { key: "springfield-us-ma", name: "Springfield", country: "United States", region: "Massachusetts", source: "geoapify" },
      { key: "springfield-uk", name: "Springfield", country: "United Kingdom", region: "Fife", source: "geoapify" },
    ]);

    expect(results).toHaveLength(3);
  });

  it("normaliza espacios y conserva caracteres no latinos", () => {
    expect(normalizeLocationQuery("  S\u00e3o   Paulo ")).toBe("sao paulo");
    expect(normalizeLocationQuery("\u6771\u4eac")).toBe("\u6771\u4eac");
  });
});
