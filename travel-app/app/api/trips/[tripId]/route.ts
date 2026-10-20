import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/app/lib/persistence/server";
import type { Currency, TripStatus } from "@/app/lib/types";

const currencies: Currency[] = ["EUR", "USD", "GBP", "MAD"];
const statuses: TripStatus[] = ["borrador", "planificado", "activo", "completado"];

function validDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function PATCH(request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { tripId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json({ error: "Los cambios del viaje no son válidos." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const allowedKeys = ["name", "origin", "destination", "startDate", "endDate", "travelers", "budget", "currency", "status"];
    if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
      return Response.json({ error: "Los cambios del viaje incluyen campos no admitidos." }, { status: 400 });
    }
    const updates: Record<string, number | string | null> = {};
    for (const key of ["name", "origin", "destination"] as const) {
      if (input[key] === undefined) continue;
      const value = input[key];
      const max = key === "name" ? 160 : 160;
      if (typeof value !== "string" || value.trim().length === 0 && key !== "origin" || value.length > max) {
        return Response.json({ error: `El campo ${key} no es válido.` }, { status: 400 });
      }
      updates[key] = key === "origin" ? value.trim() : value.trim();
    }
    if (input.travelers !== undefined) {
      if (typeof input.travelers !== "number" || !Number.isInteger(input.travelers) || input.travelers < 1 || input.travelers > 100) {
        return Response.json({ error: "El número de viajeros debe ser un entero entre 1 y 100." }, { status: 400 });
      }
      updates.travelers = input.travelers;
    }
    for (const key of ["startDate", "endDate"] as const) {
      if (input[key] === undefined) continue;
      if (!validDate(input[key])) return Response.json({ error: "Las fechas del viaje no son válidas." }, { status: 400 });
      updates[key] = input[key];
    }
    if ((input.startDate !== undefined || input.endDate !== undefined)) {
      const { data: existing, error: currentError } = await supabase
        .from("trips")
        .select("start_date,end_date,trip_days(day_number)")
        .eq("id", tripId)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!existing) return Response.json({ error: "No se encontró el viaje o no tienes permiso para modificarlo." }, { status: 404 });
      const start = input.startDate === undefined ? existing.start_date : input.startDate;
      const end = input.endDate === undefined ? existing.end_date : input.endDate;
      if (typeof start === "string" && typeof end === "string" && end < start) {
        return Response.json({ error: "La fecha de regreso no puede ser anterior a la salida." }, { status: 400 });
      }
      if (typeof start === "string" && typeof end === "string") {
        const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
        const existingDays = Array.isArray(existing.trip_days) ? existing.trip_days.length : 0;
        if (days !== existingDays) {
          return Response.json({ error: `Este viaje tiene ${existingDays} jornadas. Para conservar su itinerario, las nuevas fechas deben abarcar exactamente ${existingDays} días.` }, { status: 409 });
        }
      }
    }
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
    const requiresAtomicDateUpdate = input.startDate !== undefined || input.endDate !== undefined;
    let data;
    let error;
    if (requiresAtomicDateUpdate) {
      const rpcChanges = {
        ...updates,
        ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
        ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
      };
      const result = await supabase.rpc("update_trip_details", { p_trip_id: tripId, p_changes: rpcChanges });
      error = result.error;
      if (error?.code === "PGRST202") {
        return Response.json({ error: "La edición de fechas requiere aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
      }
      if (!error && result.data) {
        const selected = await supabase.from("trips")
          .select("id,name,origin,destination,start_date,end_date,travelers,budget,currency,status")
          .eq("id", tripId)
          .maybeSingle();
        data = selected.data;
        error = selected.error;
      }
    } else {
      const result = await supabase.from("trips").update(updates).eq("id", tripId)
        .select("id,name,origin,destination,start_date,end_date,travelers,budget,currency,status").maybeSingle();
      data = result.data;
      error = result.error;
    }
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el viaje o no tienes permiso para modificarlo." }, { status: 404 });
    return Response.json({ trip: {
      id: data.id,
      name: data.name,
      origin: data.origin,
      destination: data.destination,
      startDate: data.start_date,
      endDate: data.end_date,
      travelers: data.travelers,
      budget: Number(data.budget),
      currency: data.currency,
      status: data.status,
    } });
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
