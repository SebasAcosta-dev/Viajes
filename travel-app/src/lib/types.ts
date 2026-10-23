import type { Currency } from "@/lib/currency-catalog";
import type { LocationSuggestion } from "@/lib/location-search";

export type { Currency } from "@/lib/currency-catalog";
export type TravelType =
  | "Económico"
  | "Cultural"
  | "Gastronómico"
  | "Naturaleza"
  | "Relax"
  | "Aventura"
  | "Familiar"
  | "Combinado";

export type Interest =
  | "Cultura"
  | "Historia"
  | "Naturaleza"
  | "Gastronomía"
  | "Arquitectura"
  | "Museos"
  | "Playas"
  | "Montaña"
  | "Mercados"
  | "Compras"
  | "Vida nocturna"
  | "Actividades familiares"
  | "Aventuras"
  | "Lugares poco conocidos";

export type TripStatus = "borrador" | "planificado" | "activo" | "completado";

export interface Place {
  id: string;
  name: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  ticketEstimate: number;
  currency: Currency;
  visitMinutes: number;
  hours?: string;
  source: string;
  updatedAt: string;
}

export interface Destination {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string;
  description: string;
  lat: number;
  lng: number;
  categories: string[];
  bestSeason: string;
  recommendedDuration: string;
  budgetEstimate: number;
  image: string;
  practicalInfo: string[];
  places: Place[];
  sourceLabel: string;
  updatedAt: string;
}

export interface TripFormValues {
  origin: string;
  originLocation?: LocationSuggestion;
  destination: string;
  destinationLocation?: LocationSuggestion;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: number;
  currency: Currency;
  interests: string[];
  travelType?: TravelType;
  pace?: string;
  notes: string;
}

export interface ItineraryItem {
  id: string;
  name: string;
  description: string;
  blockType?: "activity" | "travel" | "breakfast" | "lunch" | "dinner" | "rest" | "free_time";
  location?: string;
  travelMinutes?: number;
  reliability?: "verified" | "estimated" | "unknown";
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  estimate?: number;
  pricePerPerson?: number;
  priceStatus?: "verified" | "estimate" | "unknown" | "free_verified";
  priceSource?: string;
  priceCheckedAt?: string;
  interestTags?: string[];
  budgetCategory?: "activity" | "gastronomy";
  currency: Currency;
  order: number;
  lat?: number;
  lng?: number;
  notes: string;
  source: "verificado" | "orientativo" | "desconocido";
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date?: string;
  theme: string;
  summary: string;
  items: ItineraryItem[];
}

export interface TripRecord {
  id: string;
  name: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: number;
  currency: Currency;
  interests: string[];
  travelType: TravelType;
  status: TripStatus;
  itinerary: ItineraryDay[];
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteRecord {
  id: string;
  type: "destination" | "place";
  targetId: string;
  createdAt: string;
}

export interface BudgetBreakdown {
  transportation: number;
  accommodation: number;
  meals: number;
  tickets: number;
  activities: number;
  localTransport: number;
  other: number;
}

export interface ProfilePreferences {
  name: string;
  language: string;
  currency: Currency;
  interests: string[];
  pace: string;
  budgetPreference: string;
  travelTypes: TravelType[];
}
