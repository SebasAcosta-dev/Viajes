import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";
import { createUserTripGroup, listTripGroups } from "@/features/trips/services/groups-api";
import { tripGroupRequestSchema } from "@/features/trips/api-schemas";
import { parseJsonBody } from "@/lib/api/http";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const groups = await listTripGroups(supabase, user.id);
    return Response.json({ groups });
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "42P01" || databaseError.code === "PGRST205") {
      return Response.json({ error: "Los viajes combinados requieren aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    }
    return persistenceErrorResponse(error, "trip_groups.read");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const parsed = await parseJsonBody(request, tripGroupRequestSchema, "Indica un nombre y selecciona entre 1 y 12 viajes.");
    if (!parsed.ok) return parsed.response;
    const { name, items } = parsed.data;
    const group = await createUserTripGroup(supabase, user.id, { name, items });
    if (!group) throw new Error("El servidor no pudo leer la planificación combinada creada.");
    return Response.json({ group }, { status: 201 });
  } catch (error) {
    const databaseError = error as { code?: string };
    if (["PGRST202", "42P01", "PGRST205"].includes(databaseError.code ?? "")) {
      return Response.json({ error: "Los viajes combinados requieren aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    }
    return persistenceErrorResponse(error, "trip_groups.create");
  }
}
