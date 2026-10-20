import type { Currency, ItineraryDay, TripStatus, TravelType } from "@/app/lib/types";

export interface SavedExpense {
  id: string;
  tripId: string;
  category: string;
  description: string;
  amount: number;
  currency: Currency;
  incurredOn: string;
  createdAt: string;
}

export interface SavedTrip {
  id: string;
  name: string;
  origin: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  travelers: number;
  budget: number;
  currency: Currency;
  interests: string[];
  travelType: TravelType;
  status: TripStatus;
  itinerary: ItineraryDay[];
  expenses: SavedExpense[];
  createdAt: string;
  updatedAt: string;
}

export interface TripDraft {
  name: string;
  origin?: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  travelers?: number;
  budget: number;
  currency: Currency;
  interests?: string[];
  travelType?: TravelType;
  status?: TripStatus;
  itinerary: ItineraryDay[];
}

export interface FavoriteDestination {
  id: string;
  destinationSlug: string;
  destinationName: string;
  createdAt: string;
}

export type PersistenceMode = "demo" | "supabase";
