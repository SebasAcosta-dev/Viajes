import { activityUpdateRequestSchema } from "@/features/itinerary/api-schemas";
import { updateTripActivity } from "@/features/itinerary/services/activities-api";
import { parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";

export async function PATCH(request: Request, context: { params: Promise<{ tripId: string; activityId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId, activityId } = await context.params;
    const parsed = await parseJsonBody(request, activityUpdateRequestSchema, "Los datos de la actividad no son válidos.");
    if (!parsed.ok) return parsed.response;
    const result = await updateTripActivity(supabase, user.id, tripId, activityId, parsed.data);
    if (result === "NOT_FOUND") return Response.json({ error: "No se encontró la actividad o no tienes permiso para modificarla." }, { status: 404 });
    if (result === "INVALID_DURATION") return Response.json({ error: "La duración no cabe en el horario diario de 09:00 a 21:00." }, { status: 409 });
    if (result === "OVERLAP") return Response.json({ error: "La nueva duración se solapa con otro bloque. Reduce la duración para conservar el horario." }, { status: 409 });
    return Response.json({ updated: true });
  } catch (error) {
    return persistenceErrorResponse(error, "activities.update");
  }
}
