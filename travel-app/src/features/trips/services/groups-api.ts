import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createTripGroup } from "@/lib/supabase/trip-groups";

type AppSupabase = SupabaseClient<Database, "public">;
export type TripGroupInput = {
  name: string;
  items: { tripId: string; startDate: string | null; endDate: string | null }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapGroup(row: Record<string, unknown>) {
  const rawItems = Array.isArray(row.trip_group_items) ? row.trip_group_items : [];
  const items = rawItems.filter(isRecord).map((item) => ({
    tripId: String(item.trip_id),
    sortOrder: Number(item.sort_order),
    startDate: typeof item.starts_on === "string" ? item.starts_on : null,
    endDate: typeof item.ends_on === "string" ? item.ends_on : null,
  })).sort((left, right) => left.sortOrder - right.sortOrder);
  return { id: String(row.id), name: String(row.name), createdAt: String(row.created_at), items };
}

const groupSelect = "id,name,created_at,trip_group_items(trip_id,sort_order,starts_on,ends_on)";

export async function listTripGroups(supabase: AppSupabase, userId: string) {
  const { data, error } = await supabase.from("trip_groups").select(groupSelect)
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapGroup(row as unknown as Record<string, unknown>));
}

export async function createUserTripGroup(supabase: AppSupabase, userId: string, input: TripGroupInput) {
  const result = await createTripGroup(supabase, {
    p_name: input.name,
    p_trip_ids: input.items.map((item) => item.tripId),
    p_starts_on: input.items.map((item) => item.startDate),
    p_ends_on: input.items.map((item) => item.endDate),
  });
  if (result.error) throw result.error;
  if (typeof result.data !== "string") throw new Error("El servidor no confirmó el grupo creado.");
  const { data, error } = await supabase.from("trip_groups").select(groupSelect)
    .eq("id", result.data).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapGroup(data as unknown as Record<string, unknown>) : null;
}
