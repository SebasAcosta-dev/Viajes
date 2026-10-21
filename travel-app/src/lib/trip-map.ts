import { addIsoDays } from "@/lib/date-format";
import type { SavedTrip } from "@/lib/persistence/types";
import type { ItineraryDay } from "@/lib/types";

export interface TripMapActivity {
  id: string;
  name: string;
  description: string;
  location?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  lat?: number;
  lng?: number;
  hasCoordinates: boolean;
  reliability?: string;
}

export function getTripMapActivities(trip: SavedTrip, selectedDay?: ItineraryDay): TripMapActivity[] {
  const days = selectedDay ? [selectedDay] : trip.itinerary;
  return days.flatMap((day) => {
    const date = day.date ?? (trip.startDate ? addIsoDays(trip.startDate, day.dayNumber - 1) : "");
    return day.items.map((item) => {
      const hasCoordinates = typeof item.lat === "number" && typeof item.lng === "number"
        && Number.isFinite(item.lat) && Number.isFinite(item.lng)
        && item.lat >= -90 && item.lat <= 90 && item.lng >= -180 && item.lng <= 180;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        ...(item.location ? { location: item.location } : {}),
        date: date ?? "",
        ...(item.startTime ? { startTime: item.startTime } : {}),
        ...(item.endTime ? { endTime: item.endTime } : {}),
        durationMinutes: item.durationMinutes,
        ...(hasCoordinates ? { lat: item.lat, lng: item.lng } : {}),
        hasCoordinates,
        ...(item.reliability ? { reliability: item.reliability } : {}),
      };
    });
  });
}
