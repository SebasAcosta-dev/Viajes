import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/app/lib/persistence/server";
import type { Currency, TripStatus } from "@/app/lib/types";

const currencies: Currency[] = ["EUR", "USD", "GBP", "MAD"];
const statuses: TripStatus[] = ["borrador", "planificado", "activo", "completado"];

export async function PATCH(request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { tripId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json({ error: "Los cambios del viaje no son válidos." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const updates: Record<string, number | string> = {};
    if (input.budget !== undefined) {
      if (typeof input.budget !== "number" || !Number.isFinite(input.budget) || input.budget < 0) {
        return Response.json({ error: "El presupuesto debe ser un importe no negativo." }, { status: 400 });
      }
      updates.budget = input.budget;
    }
    if (input.currency !== undefined) {
      if (typeof input.currency !== "string" || !currencies.includes(input.currency as Currency)) {
        return Response.json({ error: "La moneda no está admitida." }, { status: 400 });
      }
      updates.currency = input.currency;
    }
    if (input.status !== undefined) {
      if (typeof input.status !== "string" || !statuses.includes(input.status as TripStatus)) {
        return Response.json({ error: "El estado del viaje no es válido." }, { status: 400 });
      }
      updates.status = input.status;
    }
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No se han indicado cambios válidos." }, { status: 400 });
    }
    const { data, error } = await supabase.from("trips").update(updates).eq("id", tripId).select("id,budget,currency,status").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el viaje o no tienes permiso para modificarlo." }, { status: 404 });
    return Response.json({ trip: data });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { tripId } = await context.params;
    const { data, error } = await supabase.from("trips").delete().eq("id", tripId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el viaje o no tienes permiso para eliminarlo." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
