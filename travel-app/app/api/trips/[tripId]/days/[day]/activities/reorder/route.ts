import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/app/lib/persistence/server";

export async function POST(request: Request, context: { params: Promise<{ tripId: string; day: string }> }) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { tripId, day: dayId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)
      || !("activityIds" in body) || !Array.isArray(body.activityIds) || body.activityIds.length > 12
      || !body.activityIds.every((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      || new Set(body.activityIds).size !== body.activityIds.length) {
      return Response.json({ error: "El orden de actividades no es válido." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("reorder_trip_day_activities", {
      p_trip_id: tripId,
      p_day_id: dayId,
      p_activity_ids: body.activityIds,
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
