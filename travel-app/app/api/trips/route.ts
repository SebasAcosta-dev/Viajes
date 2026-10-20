import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/app/lib/persistence/server";
import { validateTripDraft } from "@/app/lib/persistence/validation";
import type { SavedExpense, SavedTrip, TripDraft } from "@/app/lib/persistence/types";
import type { Currency, ItineraryDay, ItineraryItem, TripStatus, TravelType } from "@/app/lib/types";

function mapExpense(row: Record<string, unknown>): SavedExpense {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    category: String(row.category),
    description: String(row.description),
    amount: Number(row.amount),
    currency: row.currency as Currency,
    incurredOn: String(row.incurred_on),
    createdAt: String(row.created_at),
    ...(typeof row.notes === "string" ? { notes: row.notes } : {}),
    ...(typeof row.activity_id === "string" ? { activityId: row.activity_id } : {}),
  };
}

function mapActivity(row: Record<string, unknown>): ItineraryItem {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    ...(typeof row.block_type === "string" ? { blockType: row.block_type as ItineraryItem["blockType"] } : {}),
    ...(typeof row.location_label === "string" ? { location: row.location_label } : {}),
    ...(typeof row.travel_minutes === "number" ? { travelMinutes: row.travel_minutes } : {}),
    ...(row.data_reliability === "verified" || row.data_reliability === "estimated" || row.data_reliability === "unknown"
      ? { reliability: row.data_reliability }
      : {}),
    ...(row.start_time ? { startTime: String(row.start_time).slice(0, 5) } : {}),
    ...(row.end_time ? { endTime: String(row.end_time).slice(0, 5) } : {}),
    durationMinutes: Number(row.duration_minutes),
    ...(row.estimate !== null ? { estimate: Number(row.estimate) } : {}),
    ...(row.price_per_person !== null ? { pricePerPerson: Number(row.price_per_person) } : {}),
    priceStatus: row.price_status as ItineraryItem["priceStatus"] ?? (row.estimate === null ? "unknown" : "estimate"),
    ...(typeof row.price_source === "string" ? { priceSource: row.price_source } : {}),
    ...(typeof row.price_checked_at === "string" ? { priceCheckedAt: row.price_checked_at } : {}),
    interestTags: Array.isArray(row.interest_tags) ? row.interest_tags as string[] : [],
    budgetCategory: row.budget_category === "gastronomy" ? "gastronomy" : "activity",
    currency: row.currency as Currency,
    order: Number(row.sort_order),
    ...(typeof row.latitude === "number" ? { lat: row.latitude } : {}),
    ...(typeof row.longitude === "number" ? { lng: row.longitude } : {}),
    notes: String(row.notes ?? ""),
    source: row.source as ItineraryItem["source"],
  };
}

function mapTrip(row: Record<string, unknown>): SavedTrip {
  const days = Array.isArray(row.trip_days) ? row.trip_days as Record<string, unknown>[] : [];
  const expenses = Array.isArray(row.expenses) ? row.expenses as Record<string, unknown>[] : [];
  const itinerary: ItineraryDay[] = days
    .sort((a, b) => Number(a.day_number) - Number(b.day_number))
    .map((day) => {
      const activities = Array.isArray(day.activities) ? day.activities as Record<string, unknown>[] : [];
      return {
        id: String(day.id),
        dayNumber: Number(day.day_number),
        ...(day.date ? { date: String(day.date) } : {}),
        theme: String(day.theme),
        summary: String(day.summary ?? ""),
        items: activities.sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map(mapActivity),
      };
    });
  return {
    id: String(row.id),
    name: String(row.name),
    origin: String(row.origin ?? ""),
    destination: String(row.destination),
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    travelers: Number(row.travelers),
    budget: Number(row.budget),
    currency: row.currency as Currency,
    interests: Array.isArray(row.interests) ? row.interests as string[] : [],
    travelType: row.travel_type as TravelType,
    status: row.status as TripStatus,
    itinerary,
    expenses: expenses.map(mapExpense),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function persistedItineraryMatchesDraft(saved: SavedTrip, draft: TripDraft): boolean {
  if (
    saved.name !== draft.name
    || saved.origin !== (draft.origin ?? "")
    || saved.destination !== draft.destination
    || saved.startDate !== (draft.startDate ?? null)
    || saved.endDate !== (draft.endDate ?? null)
    || saved.travelers !== (draft.travelers ?? 1)
    || saved.budget !== draft.budget
    || saved.currency !== draft.currency
    || saved.travelType !== (draft.travelType ?? "Combinado")
    || saved.status !== (draft.status ?? "borrador")
    || JSON.stringify(saved.interests) !== JSON.stringify(draft.interests ?? [])
    || saved.itinerary.length !== draft.itinerary.length
  ) return false;
  return draft.itinerary.every((day, dayIndex) => {
    const savedDay = saved.itinerary[dayIndex];
    if (
      !savedDay || savedDay.dayNumber !== day.dayNumber || savedDay.theme !== day.theme
      || (day.date !== undefined && savedDay.date !== day.date)
      || savedDay.items.length !== day.items.length
    ) return false;
    return day.items.every((item, itemIndex) => {
      const savedItem = savedDay.items[itemIndex];
      if (!savedItem) return false;
      return savedItem.name === item.name
        && savedItem.description === item.description
        && savedItem.startTime === item.startTime
        && savedItem.endTime === item.endTime
        && savedItem.durationMinutes === item.durationMinutes
        && savedItem.estimate === item.estimate
        && savedItem.pricePerPerson === item.pricePerPerson
        && savedItem.currency === item.currency
        && savedItem.order === item.order
        && (item.priceStatus === undefined || savedItem.priceStatus === item.priceStatus)
        && (item.interestTags === undefined || JSON.stringify(savedItem.interestTags) === JSON.stringify(item.interestTags))
        && (item.budgetCategory === undefined || savedItem.budgetCategory === item.budgetCategory)
        && (item.blockType === undefined || savedItem.blockType === item.blockType)
        && (item.location === undefined || savedItem.location === item.location)
        && (item.travelMinutes === undefined || savedItem.travelMinutes === item.travelMinutes)
        && (item.reliability === undefined || savedItem.reliability === item.reliability);
    });
  });
}

const tripSelect = "*, trip_days(*, activities(*)), expenses(*)";

function missingMetadataMigration(error: { code?: string; message?: string; details?: string; hint?: string }): string | undefined {
  const diagnostic = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (!["42703", "PGRST204"].includes(error.code ?? "")) return undefined;

  const activityMetadataColumns = [
    "price_per_person", "price_status", "price_source", "price_checked_at", "interest_tags", "budget_category",
  ];
  if (activityMetadataColumns.some((column) => diagnostic.includes(column))) {
    return "Faltan columnas de metadatos de actividades. Aplica primero la migración 20261020000200_itinerary_activity_metadata.sql.";
  }

  const scheduleColumns = ["block_type", "location_label", "travel_minutes", "data_reliability"];
  if (scheduleColumns.some((column) => diagnostic.includes(column))) {
    return "Faltan columnas de horario. Aplica la migración 20261020000300_itinerary_schedule.sql después de 20261020000200_itinerary_activity_metadata.sql.";
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    if (new URL(request.url).searchParams.get("summary") === "1") {
      const { data, error } = await supabase
        .from("trips")
        .select("id,name,destination,status,start_date,end_date,budget,currency")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const trips = (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        destination: String(row.destination),
        status: String(row.status),
        startDate: typeof row.start_date === "string" ? row.start_date : null,
        endDate: typeof row.end_date === "string" ? row.end_date : null,
        budget: Number(row.budget),
        currency: row.currency as Currency,
      }));
      return Response.json({ trips });
    }
    const { data, error } = await supabase.from("trips").select(tripSelect).order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ trips: (data ?? []).map((row) => mapTrip(row as Record<string, unknown>)) });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const body: unknown = await request.json().catch(() => null);
    const draft = validateTripDraft(body);
    if (!draft) return Response.json({ error: "Los datos del viaje o itinerario no son válidos." }, { status: 400 });
    const requiresScheduleColumns = draft.itinerary.some((day) => day.items.some((item) =>
      item.blockType !== undefined || item.location !== undefined || item.travelMinutes !== undefined || item.reliability !== undefined,
    ));
    const metadataColumns = "price_per_person,price_status,price_source,price_checked_at,interest_tags,budget_category";
    const scheduleColumns = ",block_type,location_label,travel_minutes,data_reliability";
    const { error: schemaError } = await supabase
      .from("activities")
      .select(`${metadataColumns}${requiresScheduleColumns ? scheduleColumns : ""}`)
      .limit(0);
    if (schemaError) {
      const migrationError = missingMetadataMigration(schemaError);
      if (migrationError) return Response.json({ error: migrationError }, { status: 503 });
      console.error("Trip metadata schema check failed", { code: schemaError.code ?? "unknown" });
      throw schemaError;
    }

    const { data: tripId, error: createError } = await supabase.rpc("create_trip_with_itinerary", {
      trip_payload: draft,
    });
    if (createError) {
      if (createError.code === "PGRST202" && createError.message.includes("create_trip_with_itinerary")) {
        return Response.json({
          error: "La función de guardado no está disponible. Aplica las migraciones 20261020000200_itinerary_activity_metadata.sql y 20261020000300_itinerary_schedule.sql en ese orden y actualiza el esquema de Supabase.",
        }, { status: 503 });
      }
      console.error("Trip creation failed", { code: createError.code ?? "unknown" });
      throw createError;
    }
    if (typeof tripId !== "string" || !tripId) {
      console.error("Trip creation returned no id");
      return Response.json({ error: "Supabase no confirmó la creación del viaje." }, { status: 502 });
    }
    const { data, error } = await supabase.from("trips").select(tripSelect).eq("id", tripId).single();
    if (error) {
      console.error("Saved trip read-back failed", { code: error.code ?? "unknown" });
      throw error;
    }
    const savedTrip = mapTrip(data as Record<string, unknown>);
    if (!persistedItineraryMatchesDraft(savedTrip, draft)) {
      console.error("Saved trip did not match submitted itinerary", { tripId });
      return Response.json({ error: "Supabase no confirmó todos los días, actividades y horarios del itinerario." }, { status: 502 });
    }
    return Response.json({ trip: savedTrip }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
