import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";
import { reorderActivitiesRequestSchema } from "@/features/trips/api-schemas";
import { parseJsonBody } from "@/lib/api/http";

export async function POST(request: Request, context: { params: Promise<{ tripId: string; day: string }> }) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { tripId, day: dayId } = await context.params;
    const parsed = await parseJsonBody(request, reorderActivitiesRequestSchema, "El orden de actividades no es válido.");
    if (!parsed.ok) return parsed.response;
    const { data, error } = await supabase.rpc("reorder_trip_day_activities", {
      p_trip_id: tripId,
      p_day_id: dayId,
      p_activity_ids: parsed.data.activityIds,
    });
    if (error?.code === "PGRST202") {
      return Response.json({ error: "Reordenar actividades requiere aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    }
    if (error) throw error;
    if (data !== true) return Response.json({ error: "El servidor no pudo confirmar el orden de actividades." }, { status: 409 });
    return Response.json({ reordered: true });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
