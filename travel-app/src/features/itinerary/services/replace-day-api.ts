import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { validateTripDraft } from "@/lib/persistence/validation";
import { addIsoDays } from "@/lib/date-format";
import { fromMinorUnits, requireCurrency, toMinorUnits } from "@/lib/money";
import { toSupabaseJson } from "@/lib/supabase/json";

type AppSupabase = SupabaseClient<Database, "public">;
export type ReplaceDayResult = "TRIP_NOT_FOUND" | "DAY_NOT_FOUND" | "INVALID_DAY" | "MISSING_MIGRATION" | "NOT_CONFIRMED" | "UPDATED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function replaceTripItineraryDay(
  supabase: AppSupabase,
  userId: string,
  tripId: string,
  dayNumber: number,
  incomingDay: Record<string, unknown>,
): Promise<ReplaceDayResult> {
  const { data: trip, error: tripError } = await supabase.from("trips")
    .select("name,origin,destination,start_date,end_date,travelers,budget,currency,interests,travel_type,status")
    .eq("id", tripId).eq("user_id", userId).maybeSingle();
  if (tripError) throw tripError;
  if (!trip) return "TRIP_NOT_FOUND";
  const { data: dayRow, error: dayError } = await supabase.from("trip_days").select("date")
    .eq("trip_id", tripId).eq("day_number", dayNumber).eq("user_id", userId).maybeSingle();
  if (dayError) throw dayError;
  if (!dayRow) return "DAY_NOT_FOUND";

  const date = typeof dayRow.date === "string"
    ? dayRow.date
    : typeof trip.start_date === "string" ? addIsoDays(trip.start_date, dayNumber - 1) : undefined;
  const day = { ...incomingDay, dayNumber: 1, date };
  const incomingItems: unknown[] = Array.isArray(incomingDay.items) ? incomingDay.items : [];
  const knownInterests = Array.isArray(trip.interests) ? trip.interests.filter((value): value is string => typeof value === "string") : [];
  const generatedInterests = incomingItems.flatMap((item) =>
    isRecord(item) && Array.isArray(item.interestTags) ? item.interestTags.filter((value): value is string => typeof value === "string") : [],
  );
  const draft = validateTripDraft({
    name: trip.name,
    origin: trip.origin,
    destination: trip.destination,
    ...(date ? { startDate: date, endDate: date } : {}),
    travelers: trip.travelers,
    budget: fromMinorUnits(Number(trip.budget), requireCurrency(trip.currency)),
    currency: trip.currency,
    interests: [...new Set([...knownInterests, ...generatedInterests])],
    travelType: trip.travel_type,
    status: trip.status,
    itinerary: [day],
  });
  if (!draft) return "INVALID_DAY";
  const normalizedDay = { ...draft.itinerary[0], dayNumber, ...(date ? { date } : { date: undefined }) };
  const storageDay = {
    ...normalizedDay,
    items: normalizedDay.items.map((item) => ({
      ...item,
      ...(item.estimate === undefined ? {} : { estimate: toMinorUnits(item.estimate, item.currency) }),
      ...(item.pricePerPerson === undefined ? {} : { pricePerPerson: toMinorUnits(item.pricePerPerson, item.currency) }),
    })),
  };
  const { data, error } = await supabase.rpc("replace_trip_day", {
    p_trip_id: tripId,
    p_day_number: dayNumber,
    p_day: toSupabaseJson(storageDay),
  });
  if (error?.code === "PGRST202") return "MISSING_MIGRATION";
  if (error) throw error;
  return data === true ? "UPDATED" : "NOT_CONFIRMED";
}
