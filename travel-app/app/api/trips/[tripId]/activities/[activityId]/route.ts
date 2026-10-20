import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/app/lib/persistence/server";
import { validateActivityUpdate } from "@/app/lib/persistence/validation";
import { calculateScheduledEnd } from "@/app/lib/itinerary-schedule";

export async function PATCH(request: Request, context: { params: Promise<{ tripId: string; activityId: string }> }) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { tripId, activityId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const update = validateActivityUpdate(body);
    if (!update) return Response.json({ error: "Los datos de la actividad no son válidos." }, { status: 400 });
    const { data: current, error: currentError } = await supabase
      .from("activities")
      .select("id,day_id,start_time")
      .eq("id", activityId)
      .eq("trip_id", tripId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return Response.json({ error: "No se encontró la actividad o no tienes permiso para modificarla." }, { status: 404 });

    const currentStart = typeof current.start_time === "string" ? current.start_time.slice(0, 5) : undefined;
    const endTime = currentStart ? calculateScheduledEnd(currentStart, update.durationMinutes ?? 0) : undefined;
    if (currentStart && !endTime) {
      return Response.json({ error: "La duración no cabe en el horario diario de 09:00 a 21:00." }, { status: 409 });
    }
    if (currentStart && endTime) {
      const { data: sameDay, error: dayError } = await supabase
        .from("activities")
        .select("id,start_time,end_time")
        .eq("day_id", current.day_id)
        .neq("id", activityId);
      if (dayError) throw dayError;
      const editedStartMinutes = Number(currentStart.slice(0, 2)) * 60 + Number(currentStart.slice(3, 5));
      const editedEndMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
      const overlaps = (sameDay ?? []).some((item) => {
        if (typeof item.start_time !== "string" || typeof item.end_time !== "string") return false;
        const otherStart = item.start_time.slice(0, 5);
        const otherEnd = item.end_time.slice(0, 5);
        const otherStartMinutes = Number(otherStart.slice(0, 2)) * 60 + Number(otherStart.slice(3, 5));
        const otherEndMinutes = Number(otherEnd.slice(0, 2)) * 60 + Number(otherEnd.slice(3, 5));
        return editedStartMinutes < otherEndMinutes && otherStartMinutes < editedEndMinutes;
      });
      if (overlaps) return Response.json({ error: "La nueva duración se solapa con otro bloque. Reduce la duración para conservar el horario." }, { status: 409 });
    }
    const { data, error } = await supabase
      .from("activities")
      .update({
        name: update.name,
        description: update.description,
        duration_minutes: update.durationMinutes,
        ...(endTime ? { end_time: endTime } : {}),
        ...(update.blockType ? { block_type: update.blockType } : {}),
        ...(update.location !== undefined ? { location_label: update.location } : {}),
        ...(update.travelMinutes !== undefined ? { travel_minutes: update.travelMinutes } : {}),
        ...(update.reliability ? { data_reliability: update.reliability } : {}),
        estimate: update.estimate ?? null,
        price_per_person: update.pricePerPerson ?? null,
        price_status: update.priceStatus ?? (update.estimate && update.estimate > 0 ? "estimate" : "unknown"),
      })
      .eq("id", activityId)
      .eq("trip_id", tripId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró la actividad o no tienes permiso para modificarla." }, { status: 404 });
    return Response.json({ updated: true });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
