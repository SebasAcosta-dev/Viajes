import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import type { Currency, TripStatus } from "@/lib/types";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import type { z } from "zod";
import { tripUpdateSchema } from "@/features/trips/api-schemas";

type AppSupabase = SupabaseClient<Database, "public">;
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;
type TripDetails = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  travelers: number;
  budget: number;
  currency: Currency;
  status: TripStatus;
};
export type UpdateTripResult =
  | { kind: "invalid"; status: 400 | 409; message: string }
  | { kind: "not-found" }
  | { kind: "missing-migration" }
  | { kind: "updated"; trip: TripDetails };

export async function updateUserTrip(
  supabase: AppSupabase,
  userId: string,
  tripId: string,
  input: TripUpdateInput,
  today: string,
): Promise<UpdateTripResult> {
  const updates: Database["public"]["Tables"]["trips"]["Update"] = {};
  const dateChanges: { startDate?: string | null; endDate?: string | null } = {};
  for (const key of ["name", "origin", "destination"] as const) {
    const value = input[key];
    if (value !== undefined) updates[key] = value.trim();
  }
  if (input.travelers !== undefined) updates.travelers = input.travelers;

  if (input.startDate !== undefined || input.endDate !== undefined) {
    const { data: existing, error } = await supabase.from("trips")
      .select("start_date,end_date,trip_days(day_number)")
      .eq("id", tripId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!existing) return { kind: "not-found" };
    if (input.startDate !== undefined && input.startDate !== existing.start_date
      && typeof input.startDate === "string" && input.startDate < today) {
      return { kind: "invalid", status: 400, message: "La fecha de salida modificada no puede ser anterior al día actual." };
    }
    if (input.endDate !== undefined && input.endDate !== existing.end_date
      && typeof input.endDate === "string" && input.endDate < today) {
      return { kind: "invalid", status: 400, message: "La fecha de regreso modificada no puede ser anterior al día actual." };
    }
    const start = input.startDate === undefined ? existing.start_date : input.startDate;
    const end = input.endDate === undefined ? existing.end_date : input.endDate;
    if (typeof start === "string" && typeof end === "string" && end < start) {
      return { kind: "invalid", status: 400, message: "La fecha de regreso no puede ser anterior a la salida." };
    }
    if (typeof start === "string" && typeof end === "string") {
      const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
      const existingDays = Array.isArray(existing.trip_days) ? existing.trip_days.length : 0;
      if (days !== existingDays) {
        return {
          kind: "invalid",
          status: 409,
          message: `Este viaje tiene ${existingDays} jornadas. Para conservar su itinerario, las nuevas fechas deben abarcar exactamente ${existingDays} días.`,
        };
      }
    }
    if (input.startDate !== undefined) dateChanges.startDate = input.startDate;
    if (input.endDate !== undefined) dateChanges.endDate = input.endDate;
  }

  if (input.budget !== undefined) updates.budget = toMinorUnits(input.budget, input.currency ?? "EUR");
  if (input.currency !== undefined) updates.currency = input.currency;
  if (input.status !== undefined) updates.status = input.status;
  if (Object.keys(updates).length === 0 && Object.keys(dateChanges).length === 0) {
    return { kind: "invalid", status: 400, message: "No se han indicado cambios válidos." };
  }

  const updateDatesAtomically = input.startDate !== undefined || input.endDate !== undefined;
  let data;
  let error;
  if (updateDatesAtomically) {
    const changes: Json = {
      ...(updates.name === undefined ? {} : { name: updates.name }),
      ...(updates.origin === undefined ? {} : { origin: updates.origin }),
      ...(updates.destination === undefined ? {} : { destination: updates.destination }),
      ...(updates.travelers === undefined ? {} : { travelers: updates.travelers }),
      ...(updates.budget === undefined ? {} : { budget: updates.budget }),
      ...(updates.currency === undefined ? {} : { currency: updates.currency }),
      ...(updates.status === undefined ? {} : { status: updates.status }),
      ...dateChanges,
    };
    const result = await supabase.rpc("update_trip_details", { p_trip_id: tripId, p_changes: changes });
    error = result.error;
    if (error?.code === "PGRST202") return { kind: "missing-migration" };
    if (!error && result.data) {
      const selected = await supabase.from("trips")
        .select("id,name,origin,destination,start_date,end_date,travelers,budget,currency,status")
        .eq("id", tripId).eq("user_id", userId).maybeSingle();
      data = selected.data;
      error = selected.error;
    }
  } else {
    const result = await supabase.from("trips").update(updates)
      .eq("id", tripId).eq("user_id", userId)
      .select("id,name,origin,destination,start_date,end_date,travelers,budget,currency,status").maybeSingle();
    data = result.data;
    error = result.error;
  }
  if (error) throw error;
  if (!data) return { kind: "not-found" };
  return {
    kind: "updated",
    trip: {
      id: data.id,
      name: data.name,
      origin: data.origin,
      destination: data.destination,
      startDate: data.start_date,
      endDate: data.end_date,
      travelers: data.travelers,
      budget: fromMinorUnits(Number(data.budget), data.currency as Currency),
      currency: data.currency as Currency,
      status: data.status as TripStatus,
    },
  };
}

export async function deleteUserTrip(supabase: AppSupabase, userId: string, tripId: string): Promise<boolean> {
  const { data, error } = await supabase.from("trips").delete()
    .eq("id", tripId).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
