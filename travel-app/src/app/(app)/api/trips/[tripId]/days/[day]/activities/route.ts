import { activityCreateRequestSchema } from "@/features/itinerary/api-schemas";
import { createTripActivity } from "@/features/itinerary/services/activities-api";
import { parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";

export async function POST(request: Request, context: { params: Promise<{ tripId: string; day: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId, day: dayId } = await context.params;
    const parsed = await parseJsonBody(request, activityCreateRequestSchema, "Los datos de la nueva actividad no son válidos.");
    if (!parsed.ok) return parsed.response;
    const result = await createTripActivity(supabase, user.id, tripId, dayId, parsed.data);
    if (result === "NOT_FOUND") return Response.json({ error: "No se encontró la jornada o no tienes permiso para modificarla." }, { status: 404 });
    if (result === "DAY_FULL") return Response.json({ error: "La jornada ha alcanzado el máximo de actividades reordenables." }, { status: 409 });
    if (!result.orderUpdated) {
      return Response.json({ created: true, activityId: result.id, orderUpdated: false, orderErrorCode: result.orderErrorCode }, { status: 207 });
    }
    return Response.json({ created: true, activityId: result.id, orderUpdated: true }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error, "activities.create");
  }
}
