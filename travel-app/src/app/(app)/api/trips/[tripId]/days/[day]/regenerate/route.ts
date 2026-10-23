import { regeneratedDayRequestSchema } from "@/features/trips/api-schemas";
import { replaceTripItineraryDay } from "@/features/itinerary/services/replace-day-api";
import { parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";

export async function POST(request: Request, context: { params: Promise<{ tripId: string; day: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId, day: rawDayNumber } = await context.params;
    const dayNumber = Number(rawDayNumber);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 30) {
      return Response.json({ error: "El número de jornada no es válido." }, { status: 400 });
    }
    const parsed = await parseJsonBody(request, regeneratedDayRequestSchema, "La nueva jornada no tiene un formato válido.");
    if (!parsed.ok) return parsed.response;
    const result = await replaceTripItineraryDay(supabase, user.id, tripId, dayNumber, parsed.data.day);
    if (result === "TRIP_NOT_FOUND") return Response.json({ error: "No se encontró el viaje o no tienes permiso para modificarlo." }, { status: 404 });
    if (result === "DAY_NOT_FOUND") return Response.json({ error: "No se encontró la jornada seleccionada." }, { status: 404 });
    if (result === "INVALID_DAY") return Response.json({ error: "La jornada no cumple el esquema y las validaciones del planificador; no se ha sustituido." }, { status: 400 });
    if (result === "MISSING_MIGRATION") return Response.json({ error: "La regeneración segura de jornadas requiere aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    if (result === "NOT_CONFIRMED") return Response.json({ error: "El servidor no confirmó la sustitución de la jornada." }, { status: 409 });
    return Response.json({ updated: true });
  } catch (error) {
    return persistenceErrorResponse(error, "trip_days.replace");
  }
}
