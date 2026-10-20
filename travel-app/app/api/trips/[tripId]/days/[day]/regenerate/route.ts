import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/app/lib/persistence/server";
import { validateTripDraft } from "@/app/lib/persistence/validation";
import { addIsoDays } from "@/app/lib/date-format";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, context: { params: Promise<{ tripId: string; day: string }> }) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { tripId, day: rawDayNumber } = await context.params;
    const dayNumber = Number(rawDayNumber);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 30) {
      return Response.json({ error: "El número de jornada no es válido." }, { status: 400 });
    }
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.day)) {
      return Response.json({ error: "La nueva jornada no tiene un formato válido." }, { status: 400 });
    }

    const { data: trip, error: tripError } = await supabase.from("trips")
      .select("name,origin,destination,start_date,end_date,travelers,budget,currency,interests,travel_type,status")
      .eq("id", tripId)
      .maybeSingle();
    if (tripError) throw tripError;
    if (!trip) return Response.json({ error: "No se encontró el viaje o no tienes permiso para modificarlo." }, { status: 404 });
    const { data: dayRow, error: dayError } = await supabase.from("trip_days")
      .select("date")
      .eq("trip_id", tripId)
      .eq("day_number", dayNumber)
      .maybeSingle();
    if (dayError) throw dayError;
    if (!dayRow) return Response.json({ error: "No se encontró la jornada seleccionada." }, { status: 404 });

    const date = typeof dayRow.date === "string"
      ? dayRow.date
      : typeof trip.start_date === "string" ? addIsoDays(trip.start_date, dayNumber - 1) : undefined;
    const incomingDay: Record<string, unknown> = {
      ...body.day,
      dayNumber: 1,
      date,
    };
    const incomingItems = Array.isArray(incomingDay.items) ? incomingDay.items : [];
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
      budget: Number(trip.budget),
      currency: trip.currency,
      interests: [...new Set([...knownInterests, ...generatedInterests])],
      travelType: trip.travel_type,
      status: trip.status,
      itinerary: [incomingDay],
    });
    if (!draft) return Response.json({ error: "La jornada no cumple el esquema y las validaciones del planificador; no se ha sustituido." }, { status: 400 });
    const normalizedDay = {
      ...draft.itinerary[0],
      dayNumber,
      ...(date ? { date } : { date: undefined }),
    };

    const { data, error } = await supabase.rpc("replace_trip_day", {
      p_trip_id: tripId,
      p_day_number: dayNumber,
      p_day: normalizedDay,
    });
    if (error?.code === "PGRST202") {
      return Response.json({ error: "La regeneración segura de jornadas requiere aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    }
    if (error) throw error;
    if (data !== true) return Response.json({ error: "El servidor no confirmó la sustitución de la jornada." }, { status: 409 });
    return Response.json({ updated: true });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
