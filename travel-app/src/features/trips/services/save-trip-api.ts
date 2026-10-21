import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TripDraft } from "@/lib/persistence/types";
import { toMinorUnits } from "@/lib/money";
import { toSupabaseJson } from "@/lib/supabase/json";

type AppSupabase = SupabaseClient<Database, "public">;
const tripSelect = "*, trip_days(*, activities(*)), expenses(*)";

export type SaveTripResult =
  | { kind: "missing-migration"; message: string }
  | { kind: "not-confirmed" }
  | { kind: "saved"; row: Record<string, unknown> };

function missingMetadataMigration(error: { code?: string; message?: string; details?: string; hint?: string }): string | undefined {
  const diagnostic = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (!["42703", "PGRST204"].includes(error.code ?? "")) return undefined;
  const metadataColumns = ["price_per_person", "price_status", "price_source", "price_checked_at", "interest_tags", "budget_category"];
  if (metadataColumns.some((column) => diagnostic.includes(column))) {
    return "Faltan columnas de metadatos de actividades. Aplica primero la migración 20261020000200_itinerary_activity_metadata.sql.";
  }
  const scheduleColumns = ["block_type", "location_label", "travel_minutes", "data_reliability"];
  if (scheduleColumns.some((column) => diagnostic.includes(column))) {
    return "Faltan columnas de horario. Aplica la migración 20261020000300_itinerary_schedule.sql después de 20261020000200_itinerary_activity_metadata.sql.";
  }
  return undefined;
}

export async function saveTripWithItinerary(
  supabase: AppSupabase,
  userId: string,
  draft: TripDraft,
): Promise<SaveTripResult> {
  const needsSchedule = draft.itinerary.some((day) => day.items.some((item) =>
    item.blockType !== undefined || item.location !== undefined || item.travelMinutes !== undefined || item.reliability !== undefined,
  ));
  const metadataColumns = "price_per_person,price_status,price_source,price_checked_at,interest_tags,budget_category";
  const scheduleColumns = ",block_type,location_label,travel_minutes,data_reliability";
  const { error: schemaError } = await supabase.from("activities")
    .select(`${metadataColumns}${needsSchedule ? scheduleColumns : ""}`).limit(0);
  if (schemaError) {
    const message = missingMetadataMigration(schemaError);
    if (message) return { kind: "missing-migration", message };
    console.error("Trip metadata schema check failed", {
      code: schemaError.code ?? "unknown",
      message: schemaError.message.slice(0, 200),
    });
    throw schemaError;
  }

  const storageDraft: TripDraft = {
    ...draft,
    budget: toMinorUnits(draft.budget, draft.currency),
    itinerary: draft.itinerary.map((day) => ({
      ...day,
      items: day.items.map((item) => ({
        ...item,
        ...(item.estimate === undefined ? {} : { estimate: toMinorUnits(item.estimate, item.currency) }),
        ...(item.pricePerPerson === undefined ? {} : { pricePerPerson: toMinorUnits(item.pricePerPerson, item.currency) }),
      })),
    })),
  };
  const { data: tripId, error: createError } = await supabase.rpc("create_trip_with_itinerary", {
    trip_payload: toSupabaseJson(storageDraft),
  });
  if (createError) {
    if (createError.code === "PGRST202" && createError.message.includes("create_trip_with_itinerary")) {
      return { kind: "missing-migration", message: "La función de guardado no está disponible. Aplica las migraciones 20261020000200_itinerary_activity_metadata.sql y 20261020000300_itinerary_schedule.sql en ese orden y actualiza el esquema de Supabase." };
    }
    throw createError;
  }
  if (typeof tripId !== "string" || !tripId) return { kind: "not-confirmed" };
  const { data, error } = await supabase.from("trips").select(tripSelect)
    .eq("id", tripId).eq("user_id", userId).single();
  if (error) throw error;
  return { kind: "saved", row: data as unknown as Record<string, unknown> };
}
