import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ItineraryItem } from "@/lib/types";
import { calculateScheduledEnd } from "@/lib/itinerary-schedule";
import { requireCurrency, toMinorUnits } from "@/lib/money";

type AppSupabase = SupabaseClient<Database, "public">;
export type ActivityUpdateResult = "NOT_FOUND" | "INVALID_DURATION" | "OVERLAP" | "UPDATED";

export interface NewTripActivity {
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  location?: string;
  blockType: NonNullable<ItineraryItem["blockType"]>;
}

export type ActivityCreateResult =
  | { kind: "created"; id: string; orderUpdated: true }
  | { kind: "created"; id: string; orderUpdated: false; orderErrorCode: string };

export async function createTripActivity(
  supabase: AppSupabase,
  userId: string,
  tripId: string,
  dayId: string,
  activity: NewTripActivity,
): Promise<ActivityCreateResult | "NOT_FOUND" | "DAY_FULL"> {
  const { data: day, error: dayError } = await supabase.from("trip_days")
    .select("id")
    .eq("id", dayId).eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
  if (dayError) throw dayError;
  if (!day) return "NOT_FOUND";

  const { data: trip, error: tripError } = await supabase.from("trips")
    .select("currency")
    .eq("id", tripId).eq("user_id", userId).maybeSingle();
  if (tripError) throw tripError;
  if (!trip) return "NOT_FOUND";

  const { data: existing, error: listError } = await supabase.from("activities")
    .select("id,sort_order,start_time,end_time")
    .eq("trip_id", tripId).eq("day_id", dayId).eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (listError) throw listError;
  const current = existing ?? [];
  // The reorder RPC shifts current positions by 100 before writing final order.
  const nextOrder = Math.max(0, ...current.map((entry) => entry.sort_order)) + 1;
  if (current.length >= 100 || nextOrder > 100) return "DAY_FULL";

  const currency = requireCurrency(trip.currency);
  const { data: created, error: insertError } = await supabase.from("activities").insert({
    trip_id: tripId,
    day_id: dayId,
    user_id: userId,
    name: activity.name,
    description: activity.description,
    start_time: activity.startTime,
    end_time: activity.endTime,
    duration_minutes: activity.durationMinutes,
    currency,
    sort_order: nextOrder,
    block_type: activity.blockType,
    location_label: activity.location || null,
    source: "desconocido",
    price_status: "unknown",
    data_reliability: "unknown",
  }).select("id").single();
  if (insertError) throw insertError;

  const sortedIds = [
    ...current.map((entry) => ({
      id: entry.id,
      start: typeof entry.start_time === "string" ? entry.start_time.slice(0, 5) : "99:99",
      end: typeof entry.end_time === "string" ? entry.end_time.slice(0, 5) : "99:99",
    })),
    { id: created.id, start: activity.startTime, end: activity.endTime },
  ].sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end)).map((entry) => entry.id);
  const { data: reordered, error: reorderError } = await supabase.rpc("reorder_trip_day_activities", {
    p_trip_id: tripId,
    p_day_id: dayId,
    p_activity_ids: sortedIds,
  });
  if (reorderError || reordered !== true) {
    const orderErrorCode = reorderError?.code ?? "ORDER_NOT_CONFIRMED";
    console.error("[activities.create.order]", { code: orderErrorCode });
    return { kind: "created", id: created.id, orderUpdated: false, orderErrorCode };
  }
  return { kind: "created", id: created.id, orderUpdated: true };
}

export async function deleteTripActivity(
  supabase: AppSupabase,
  userId: string,
  tripId: string,
  activityId: string,
): Promise<boolean> {
  const { data, error } = await supabase.from("activities").delete()
    .eq("id", activityId).eq("trip_id", tripId).eq("user_id", userId)
    .select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

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
