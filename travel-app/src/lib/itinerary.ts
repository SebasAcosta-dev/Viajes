import { Currency, Destination, ItineraryDay, ItineraryItem, Place, TripFormValues } from "@/lib/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@/lib/money";

const interestKeywords: Record<string, string[]> = {
  "historia": ["histor", "medina", "palacio", "monumento", "ruina", "museo", "patrimonio"],
  "patrimonio cultural": ["histor", "cultural", "medina", "monumento", "patrimonio"],
  "iglesias y catedrales": ["iglesia", "church", "catedral", "basilica"],
  "templos y lugares religiosos": ["templo", "mezquita", "mosque", "sinagoga", "monasterio"],
  "museos": ["museo", "museum", "galeria"],
  "arte y exposiciones": ["arte", "art", "exposicion", "galeria", "museo"],
  "otros deportes": ["deporte", "sport", "estadio", "arena"],
  "eventos deportivos": ["deporte", "sport", "estadio", "evento", "partido"],
  "parques y jardines": ["parque", "jardin", "garden", "bosque"],
  "montaña y senderismo": ["montana", "mountain", "sender", "hiking", "ruta"],
  "playas y naturaleza": ["playa", "beach", "costa", "naturaleza", "parque natural"],
  "ocio y entretenimiento": ["ocio", "entretenimiento", "parque tematico", "diversion"],
  "eventos y espectáculos": ["evento", "espectaculo", "concierto", "teatro", "festival"],
  "mercados": ["mercado", "market", "zoco", "souk"],
  "tiendas y zonas comerciales": ["tienda", "comercial", "shopping", "mercado", "zoco"],
  "arquitectura": ["arquitect", "palacio", "historic", "monumento", "edificio"],
  "barrios y lugares emblemáticos": ["barrio", "medina", "centro", "emblematico", "historic"],
  "parques naturales": ["parque", "jardin", "garden", "bosque", "naturaleza"],
  "fútbol": ["futbol", "football", "soccer", "estadio", "deportivo"],
  "mercados tradicionales": ["mercado", "market", "zoco", "souk"],
  "zocos": ["zoco", "souk", "mercado", "market"],
  "gastronomía local": ["gastronomia", "comida", "food", "restaurante", "mercado"],
  "iglesias": ["iglesia", "church", "catedral", "basilica"],
  "catedrales": ["catedral", "cathedral", "iglesia"],
  "mezquitas": ["mezquita", "mosque"],
  "sinagogas": ["sinagoga", "synagogue"],
  "arquitectura religiosa": ["iglesia", "mezquita", "sinagoga", "templo", "monasterio", "catedral"],
  "castillos": ["castillo", "castle", "fortaleza"],
  "monumentos": ["monumento", "palacio", "monument", "historic"],
  "patrimonio histórico": ["histor", "medina", "monumento", "palacio", "patrimonio"],
  "barrios históricos": ["medina", "histor", "barrio", "old town"],
  "museos de arte": ["museo", "museum", "arte", "galeria"],
  "museos deportivos": ["museo", "museum", "deporte", "sport"],
  "museos de historia": ["museo", "museum", "histor"],
  "jardines botánicos": ["jardin", "garden", "botan"],
  "baños termales": ["termal", "thermal", "baño", "bath"],
  "playas": ["playa", "beach", "costa"],
  "montañas": ["montaña", "mountain", "mont"],
  "senderismo": ["sender", "hiking", "ruta"],
  "arquitectura histórica": ["arquitect", "palacio", "historic", "monumento", "medina"],
};

function normalizeInterestText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

function interestsForPlace(place: Pick<Place, "name" | "category" | "description">, interests: string[]): string[] {
  const description = normalizeInterestText(`${place.name} ${place.category} ${place.description}`);
  return interests.filter((interest) => {
    const normalizedInterest = normalizeInterestText(interest);
    const aliases = interestKeywords[normalizedInterest] ?? [];
    return description.includes(normalizedInterest) ||
      aliases.some((alias) => description.includes(normalizeInterestText(alias)));
  });
}

export function generateItineraryFromTrip(
  destination: Pick<Destination, "name" | "places"> & Partial<Pick<Destination, "lat" | "lng">>,
  form: TripFormValues,
): ItineraryDay[] {
  const days: ItineraryDay[] = [];
  const startTime = Date.parse(`${form.startDate}T00:00:00Z`);
  const endTime = Date.parse(`${form.endDate}T00:00:00Z`);
  const daysCount = Math.max(1, Math.ceil((endTime - startTime) / 86_400_000) + 1);

  const matchingPlaces = form.interests.length
    ? destination.places.filter((place) => interestsForPlace(place, form.interests).length > 0)
    : destination.places;
  const places: Array<Omit<Place, "lat" | "lng"> & Partial<Pick<Place, "lat" | "lng">>> = matchingPlaces.length
    ? matchingPlaces
    : [{
        id: "fallback-place",
        name: "Paseo recomendado",
        description: "No hay lugares locales asociados a los intereses seleccionados; consulta el asistente para alternativas.",
        category: "General",
        ...(typeof destination.lat === "number" && Number.isFinite(destination.lat)
          && typeof destination.lng === "number" && Number.isFinite(destination.lng)
          ? { lat: destination.lat, lng: destination.lng }
          : {}),
        address: destination.name,
        ticketEstimate: 0,
        currency: form.currency,
        visitMinutes: 90,
        source: "Datos orientativos",
        updatedAt: new Date().toISOString(),
      }];

  for (let dayIndex = 0; dayIndex < daysCount; dayIndex += 1) {
    const dateISO = new Date(startTime + dayIndex * 86_400_000).toISOString().slice(0, 10);
    const theme = dayIndex === 0 ? "Bienvenida" : dayIndex === 1 ? "Exploración" : `Día ${dayIndex + 1}`;
    const items: ItineraryItem[] = places.slice(dayIndex * 3, dayIndex * 3 + 3).map((place, index) => {
      const matchedInterests = interestsForPlace(place, form.interests);
      const hasEstimate = place.ticketEstimate > 0;
      return {
      id: `day-${dayIndex + 1}-item-${index + 1}`,
      name: place.name,
      description: place.description,
      durationMinutes: place.visitMinutes,
      ...(hasEstimate ? {
        pricePerPerson: place.ticketEstimate,
        estimate: Number((place.ticketEstimate * form.travelers).toFixed(2)),
      } : {}),
      priceStatus: hasEstimate ? "estimate" : "unknown",
      currency: place.currency,
      order: index + 1,
      ...(typeof place.lat === "number" && Number.isFinite(place.lat)
        && typeof place.lng === "number" && Number.isFinite(place.lng)
        ? { lat: place.lat, lng: place.lng }
        : {}),
      notes: `${place.source} (información orientativa) · ${place.address}`,
      source: "orientativo",
      ...(matchedInterests.length ? { interestTags: matchedInterests } : {}),
      budgetCategory: "activity",
    };
    });

    days.push({
      id: `itinerary-day-${dayIndex + 1}`,
      dayNumber: dayIndex + 1,
      date: dateISO,
      theme,
      summary: `Plan ${theme.toLowerCase()} para ${destination.name}${form.travelType ? ` con foco en ${form.travelType.toLowerCase()}` : ""}.`,
      items,
    });
  }

  return days;
}

export function getTripBudgetSummary(trip: {
  budget: number;
  currency: Currency;
  travelers: number;
  itinerary: ItineraryDay[];
  expenses?: { amount: number; currency: Currency; activityId?: string }[];
}): {
  totalEstimated: number;
  avgPerPerson: number;
  dailyAvg: number;
  actualExpenses: number;
  remainingBudget: number;
  projectedRemaining: number;
  unknownActivityPrices: number;
  projectionIncomplete: boolean;
} {
  const realizedActivityIds = new Set(
    (trip.expenses ?? [])
      .filter((expense) => expense.currency === trip.currency && expense.activityId)
      .map((expense) => expense.activityId as string),
  );
  const totalEstimatedMinor = trip.itinerary.reduce(
    (sum, day) => day.items.reduce((daySum, item) => (
      (item.blockType === undefined || item.blockType === "activity")
      && item.budgetCategory !== "gastronomy"
      && item.currency === trip.currency
      && !realizedActivityIds.has(item.id)
      && item.priceStatus !== "unknown"
        ? addMinorUnits(daySum, toMinorUnits(item.estimate ?? 0, trip.currency))
        : daySum
    ), sum),
    0 as ReturnType<typeof toMinorUnits>,
  );
  const unknownActivityPrices = trip.itinerary.flatMap((day) => day.items).filter((item) =>
    (item.blockType === undefined || item.blockType === "activity")
    &&
    item.budgetCategory !== "gastronomy"
    && !realizedActivityIds.has(item.id)
    && (
      item.priceStatus === "unknown"
      || item.priceStatus !== "free_verified" && (item.estimate === undefined || item.estimate === 0)
    )
  ).length;
  const actualExpensesMinor = (trip.expenses ?? [])
    .filter((expense) => expense.currency === trip.currency)
    .reduce((sum, expense) => addMinorUnits(sum, toMinorUnits(expense.amount, trip.currency)), 0 as ReturnType<typeof toMinorUnits>);
  const budgetMinor = toMinorUnits(trip.budget, trip.currency);
  const totalEstimated = fromMinorUnits(totalEstimatedMinor, trip.currency);
  const actualExpenses = fromMinorUnits(actualExpensesMinor, trip.currency);

  const totalDays = trip.itinerary.length || 1;
  return {
    totalEstimated,
    avgPerPerson: Number((totalEstimated / Math.max(trip.travelers, 1)).toFixed(2)),
    dailyAvg: Number((totalEstimated / totalDays).toFixed(2)),
    actualExpenses,
    remainingBudget: fromMinorUnits(budgetMinor - actualExpensesMinor, trip.currency),
    projectedRemaining: fromMinorUnits(budgetMinor - actualExpensesMinor - totalEstimatedMinor, trip.currency),
    unknownActivityPrices,
    projectionIncomplete: unknownActivityPrices > 0,
  };
}
