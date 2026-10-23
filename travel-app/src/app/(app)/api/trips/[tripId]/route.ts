import { tripUpdateSchema } from "@/features/trips/api-schemas";
import { deleteUserTrip, updateUserTrip } from "@/features/trips/services/trip-details-api";
import { parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";
import { requestTodayIso } from "@/lib/trip-dates";

export async function PATCH(request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId } = await context.params;
    const parsed = await parseJsonBody(request, tripUpdateSchema, "Los cambios del viaje no son válidos.");
    if (!parsed.ok) return parsed.response;
    const result = await updateUserTrip(supabase, user.id, tripId, parsed.data, requestTodayIso(request));
    if (result.kind === "invalid") return Response.json({ error: result.message }, { status: result.status });
    if (result.kind === "not-found") {
      return Response.json({ error: "No se encontró el viaje o no tienes permiso para modificarlo." }, { status: 404 });
    }
    if (result.kind === "missing-migration") {
      return Response.json({ error: "La edición de fechas requiere aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    }
    return Response.json({ trip: result.trip });
  } catch (error) {
    return persistenceErrorResponse(error, "trips.update");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId } = await context.params;
    const deleted = await deleteUserTrip(supabase, user.id, tripId);
    if (!deleted) return Response.json({ error: "No se encontró el viaje o no tienes permiso para eliminarlo." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return persistenceErrorResponse(error, "trips.delete");
  }
}
