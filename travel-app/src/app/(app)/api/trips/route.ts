import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/lib/persistence/server";
import type { SavedExpense, SavedTrip, TripDraft } from "@/lib/persistence/types";
import type { Currency, ItineraryDay, ItineraryItem, TripStatus, TravelType } from "@/lib/types";
import { normalizeNewTripDates, requestTodayIso } from "@/lib/trip-dates";
import { fromMinorUnits } from "@/lib/money";
import { parseJsonBody } from "@/lib/api/http";
import { tripDraftRequestSchema } from "@/features/trips/api-schemas";
import { saveTripWithItinerary } from "@/features/trips/services/save-trip-api";

function mapExpense(row: Record<string, unknown>): SavedExpense {
  const currency = row.currency as Currency;
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    category: String(row.category),
    description: String(row.description),
    amount: fromMinorUnits(Number(row.amount), currency),
    currency,
    incurredOn: String(row.incurred_on),
    createdAt: String(row.created_at),
    ...(typeof row.notes === "string" ? { notes: row.notes } : {}),
    ...(typeof row.activity_id === "string" ? { activityId: row.activity_id } : {}),
  };
}

function mapActivity(row: Record<string, unknown>): ItineraryItem {
  const currency = row.currency as Currency;
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
    ...(row.estimate !== null ? { estimate: fromMinorUnits(Number(row.estimate), currency) } : {}),
    ...(row.price_per_person !== null ? { pricePerPerson: fromMinorUnits(Number(row.price_per_person), currency) } : {}),
    priceStatus: row.price_status as ItineraryItem["priceStatus"] ?? (row.estimate === null ? "unknown" : "estimate"),
    ...(typeof row.price_source === "string" ? { priceSource: row.price_source } : {}),
    ...(typeof row.price_checked_at === "string" ? { priceCheckedAt: row.price_checked_at } : {}),
    interestTags: Array.isArray(row.interest_tags) ? row.interest_tags as string[] : [],
    budgetCategory: row.budget_category === "gastronomy" ? "gastronomy" : "activity",
    currency,
    order: Number(row.sort_order),
    ...(typeof row.latitude === "number" ? { lat: row.latitude } : {}),
    ...(typeof row.longitude === "number" ? { lng: row.longitude } : {}),
    notes: String(row.notes ?? ""),
    source: row.source as ItineraryItem["source"],
  };
}

function mapTrip(row: Record<string, unknown>): SavedTrip {
  const currency = row.currency as Currency;
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
    budget: fromMinorUnits(Number(row.budget), currency),
    currency,
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

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (new URL(request.url).searchParams.get("summary") === "1") {
      const { data, error } = await supabase
        .from("trips")
        .select("id,name,destination,status,start_date,end_date,budget,currency")
        .eq("user_id", user.id)
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
        budget: fromMinorUnits(Number(row.budget), row.currency as Currency),
        currency: row.currency as Currency,
      }));
      return Response.json({ trips });
    }
    const { data, error } = await supabase.from("trips").select(tripSelect)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ trips: (data ?? []).map((row) => mapTrip(row as Record<string, unknown>)) });
  } catch (error) {
    return persistenceErrorResponse(error, "trips.read");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const parsedBody = await parseJsonBody(request, tripDraftRequestSchema, "El cuerpo de la solicitud debe ser JSON válido.");
    if (!parsedBody.ok) return parsedBody.response;
    const parsedDraft = parsedBody.data;
    const draft = normalizeNewTripDates(parsedDraft, requestTodayIso(request));
    const result = await saveTripWithItinerary(supabase, user.id, draft);
    if (result.kind === "missing-migration") {
      return Response.json({ error: result.message }, { status: 503 });
    }
    if (result.kind === "not-confirmed") {
      return Response.json({ error: "Supabase no confirmó la creación del viaje." }, { status: 502 });
    }
    const savedTrip = mapTrip(result.row);
    if (!persistedItineraryMatchesDraft(savedTrip, draft)) {
      return Response.json({ error: "Supabase no confirmó todos los días, actividades y horarios del itinerario." }, { status: 502 });
    }
    return Response.json({ trip: savedTrip }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error, "trips.create");
  }
}
