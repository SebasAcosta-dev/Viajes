export interface LocationSuggestion {
  key: string;
  name: string;
  country: string;
  region?: string;
  geographicId?: string;
  latitude?: number;
  longitude?: number;
  source: "local" | "geoapify";
  aliases?: string[];
}

export const popularLocations: LocationSuggestion[] = [
  { key: "barcelona-es", name: "Barcelona", country: "España", latitude: 41.3874, longitude: 2.1686, source: "local" },
  { key: "madrid-es", name: "Madrid", country: "España", latitude: 40.4168, longitude: -3.7038, source: "local" },
  { key: "paris-fr", name: "París", country: "Francia", aliases: ["Paris"], latitude: 48.8566, longitude: 2.3522, source: "local" },
  { key: "london-gb", name: "Londres", country: "Reino Unido", aliases: ["London"], latitude: 51.5072, longitude: -0.1276, source: "local" },
  { key: "rome-it", name: "Roma", country: "Italia", aliases: ["Rome"], latitude: 41.9028, longitude: 12.4964, source: "local" },
  { key: "lisbon-pt", name: "Lisboa", country: "Portugal", aliases: ["Lisbon"], latitude: 38.7223, longitude: -9.1393, source: "local" },
  { key: "amsterdam-nl", name: "Ámsterdam", country: "Países Bajos", aliases: ["Amsterdam"], latitude: 52.3676, longitude: 4.9041, source: "local" },
  { key: "berlin-de", name: "Berlín", country: "Alemania", aliases: ["Berlin"], latitude: 52.52, longitude: 13.405, source: "local" },
  { key: "prague-cz", name: "Praga", country: "Chequia", aliases: ["Prague"], latitude: 50.0755, longitude: 14.4378, source: "local" },
  { key: "vienna-at", name: "Viena", country: "Austria", aliases: ["Vienna"], latitude: 48.2082, longitude: 16.3738, source: "local" },
  { key: "athens-gr", name: "Atenas", country: "Grecia", aliases: ["Athens"], latitude: 37.9838, longitude: 23.7275, source: "local" },
  { key: "istanbul-tr", name: "Estambul", country: "Turquía", aliases: ["Istanbul"], latitude: 41.0082, longitude: 28.9784, source: "local" },
  { key: "marrakech-ma", name: "Marrakech", country: "Marruecos", latitude: 31.6295, longitude: -7.9811, source: "local" },
  { key: "new-york-us", name: "Nueva York", country: "Estados Unidos", region: "Nueva York", aliases: ["New York", "New York City", "NYC"], latitude: 40.7128, longitude: -74.006, source: "local" },
  { key: "miami-us", name: "Miami", country: "Estados Unidos", region: "Florida", latitude: 25.7617, longitude: -80.1918, source: "local" },
  { key: "tokyo-jp", name: "Tokio", country: "Japón", aliases: ["Tokyo"], latitude: 35.6762, longitude: 139.6503, source: "local" },
  { key: "bangkok-th", name: "Bangkok", country: "Tailandia", latitude: 13.7563, longitude: 100.5018, source: "local" },
  { key: "bogota-co", name: "Bogotá", country: "Colombia", aliases: ["Bogota"], latitude: 4.711, longitude: -74.0721, source: "local" },
  { key: "medellin-co", name: "Medellín", country: "Colombia", region: "Antioquia", aliases: ["Medellin"], latitude: 6.2442, longitude: -75.5812, source: "local" },
  { key: "cartagena-co", name: "Cartagena de Indias", country: "Colombia", region: "Bolívar", aliases: ["Cartagena"], latitude: 10.391, longitude: -75.4794, source: "local" },
  { key: "mexico-city-mx", name: "Ciudad de México", country: "México", aliases: ["Mexico City", "CDMX"], latitude: 19.4326, longitude: -99.1332, source: "local" },
  { key: "buenos-aires-ar", name: "Buenos Aires", country: "Argentina", latitude: -34.6037, longitude: -58.3816, source: "local" },
  { key: "lima-pe", name: "Lima", country: "Perú", latitude: -12.0464, longitude: -77.0428, source: "local" },
  { key: "santiago-cl", name: "Santiago de Chile", country: "Chile", region: "Región Metropolitana", aliases: ["Santiago"], latitude: -33.4489, longitude: -70.6693, source: "local" },
];

export function normalizeLocationQuery(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function locationMatchRank(location: LocationSuggestion, query: string): number | undefined {
  if (!query) return 0;
  const values = [location.name, ...(location.aliases ?? [])].map(normalizeLocationQuery);
  if (values.some((value) => value === query)) return 0;
  if (values.some((value) => value.startsWith(query))) return 1;
  if (values.some((value) => value.includes(query))) return 2;
  return undefined;
}

export function searchPopularLocations(query: string, limit = 8): LocationSuggestion[] {
  const normalizedQuery = normalizeLocationQuery(query);
  return popularLocations
    .map((location, index) => ({ location, index, rank: locationMatchRank(location, normalizedQuery) }))
    .filter((entry): entry is typeof entry & { rank: number } => entry.rank !== undefined)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map(({ location }) => location);
}

export function combineLocationSuggestions(
  query: string,
  local: LocationSuggestion[],
  remote: LocationSuggestion[],
  limit = 8,
): LocationSuggestion[] {
  const normalizedQuery = normalizeLocationQuery(query);
  const candidates = [
    ...local.map((location, index) => ({ location, index, rank: locationMatchRank(location, normalizedQuery) })),
    ...remote.map((location, index) => ({
      location,
      index: local.length + index,
      // Remote results are already matched by the geocoder; their localized label can differ from the query.
      rank: locationMatchRank(location, normalizedQuery) ?? 3,
    })),
  ]
    .filter((entry): entry is typeof entry & { rank: number } => entry.rank !== undefined)
    .sort((left, right) => left.rank - right.rank || left.index - right.index);
  const seen = new Set<string>();
  const results: LocationSuggestion[] = [];

  for (const { location } of candidates) {
    const normalizedName = normalizeLocationQuery(location.name);
    const matchingPopular = popularLocations.find((popular) =>
      normalizeLocationQuery(popular.name) === normalizedName
      || popular.aliases?.some((alias) => normalizeLocationQuery(alias) === normalizedName),
    );
    const canonicalName = normalizeLocationQuery(matchingPopular?.name ?? location.name);
    const key = `${canonicalName}|${normalizeLocationQuery(location.region ?? "")}|${normalizeLocationQuery(location.country)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(location);
    if (results.length >= limit) break;
  }
  return results;
}
