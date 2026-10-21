import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ItineraryItem } from "@/lib/types";
import { calculateScheduledEnd } from "@/lib/itinerary-schedule";
import { requireCurrency, toMinorUnits } from "@/lib/money";

type AppSupabase = SupabaseClient<Database, "public">;
export type ActivityUpdateResult = "NOT_FOUND" | "INVALID_DURATION" | "OVERLAP" | "UPDATED";

export async function updateTripActivity(
  supabase: AppSupabase,
  userId: string,
  tripId: string,
  activityId: string,
  update: Partial<ItineraryItem>,
): Promise<ActivityUpdateResult> {
  const { data: current, error: currentError } = await supabase.from("activities")
    .select("id,day_id,start_time,currency")
    .eq("id", activityId).eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return "NOT_FOUND";

  const currentStart = update.startTime ?? (typeof current.start_time === "string" ? current.start_time.slice(0, 5) : undefined);
  const endTime = currentStart ? calculateScheduledEnd(currentStart, update.durationMinutes ?? 0) : undefined;
  if (currentStart && !endTime) return "INVALID_DURATION";
  if (currentStart && endTime) {
    const { data: sameDay, error: dayError } = await supabase.from("activities")
      .select("id,start_time,end_time")
      .eq("day_id", current.day_id).eq("trip_id", tripId).eq("user_id", userId).neq("id", activityId);
    if (dayError) throw dayError;
    const editedStartMinutes = Number(currentStart.slice(0, 2)) * 60 + Number(currentStart.slice(3, 5));
    const editedEndMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
    const overlaps = (sameDay ?? []).some((item) => {
      if (typeof item.start_time !== "string" || typeof item.end_time !== "string") return false;
      const otherStart = item.start_time.slice(0, 5);
      const otherEnd = item.end_time.slice(0, 5);
      const otherStartMinutes = Number(otherStart.slice(0, 2)) * 60 + Number(otherStart.slice(3, 5));
      const otherEndMinutes = Number(otherEnd.slice(0, 2)) * 60 + Number(otherEnd.slice(3, 5));
      return editedStartMinutes < otherEndMinutes && otherStartMinutes < editedEndMinutes;
    });
    if (overlaps) return "OVERLAP";
  }

  const currency = update.currency ?? requireCurrency(current.currency);
  const { data, error } = await supabase.from("activities").update({
    name: update.name,
    description: update.description,
    duration_minutes: update.durationMinutes,
    ...(endTime ? { start_time: currentStart, end_time: endTime } : {}),
    ...(update.lat !== undefined ? { latitude: update.lat, longitude: update.lng } : {}),
    ...(update.blockType ? { block_type: update.blockType } : {}),
    ...(update.location !== undefined ? { location_label: update.location } : {}),
    ...(update.travelMinutes !== undefined ? { travel_minutes: update.travelMinutes } : {}),
    ...(update.reliability ? { data_reliability: update.reliability } : {}),
    estimate: update.estimate === undefined ? null : toMinorUnits(update.estimate, currency),
    price_per_person: update.pricePerPerson === undefined ? null : toMinorUnits(update.pricePerPerson, currency),
    price_status: update.priceStatus ?? (update.estimate && update.estimate > 0 ? "estimate" : "unknown"),
  }).eq("id", activityId).eq("trip_id", tripId).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw error;
  return data ? "UPDATED" : "NOT_FOUND";
}
