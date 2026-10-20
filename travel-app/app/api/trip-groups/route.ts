import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/app/lib/persistence/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function mapGroup(row: Record<string, unknown>) {
  const rawItems = Array.isArray(row.trip_group_items) ? row.trip_group_items : [];
  const items = rawItems.filter(isRecord).map((item) => ({
    tripId: String(item.trip_id),
    sortOrder: Number(item.sort_order),
    startDate: typeof item.starts_on === "string" ? item.starts_on : null,
    endDate: typeof item.ends_on === "string" ? item.ends_on : null,
  })).sort((left, right) => left.sortOrder - right.sortOrder);
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    items,
  };
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { data, error } = await supabase
      .from("trip_groups")
      .select("id,name,created_at,trip_group_items(trip_id,sort_order,starts_on,ends_on)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error?.code === "42P01" || error?.code === "PGRST205") {
      return Response.json({ error: "Los viajes combinados requieren aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    }
    if (error) throw error;
    return Response.json({ groups: (data ?? []).map((row) => mapGroup(row as Record<string, unknown>)) });
  } catch (error) {
    return persistenceErrorResponse(error, "trip_groups.read");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 160
      || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 12) {
      return Response.json({ error: "Indica un nombre y selecciona entre 1 y 12 viajes." }, { status: 400 });
    }
    const items = body.items;
    if (!items.every((item) => isRecord(item)
      && typeof item.tripId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.tripId)
      && validDate(item.startDate) && validDate(item.endDate)
      && (!(typeof item.startDate === "string" && typeof item.endDate === "string") || item.endDate >= item.startDate))) {
      return Response.json({ error: "Las fechas o los identificadores de los viajes combinados no son válidos." }, { status: 400 });
    }
    const ids = items.map((item) => (item as Record<string, unknown>).tripId as string);
    if (new Set(ids).size !== ids.length) return Response.json({ error: "No se puede incluir el mismo viaje más de una vez." }, { status: 400 });

    const result = await supabase.rpc("create_trip_group", {
      p_name: body.name.trim(),
      p_trip_ids: ids,
      p_starts_on: items.map((item) => (item as Record<string, unknown>).startDate),
      p_ends_on: items.map((item) => (item as Record<string, unknown>).endDate),
    });
    if (result.error?.code === "PGRST202" || result.error?.code === "42P01") {
      return Response.json({ error: "Los viajes combinados requieren aplicar la migración 20261020000400_trip_management.sql." }, { status: 503 });
    }
    if (result.error) throw result.error;
    if (typeof result.data !== "string") throw new Error("El servidor no confirmó el grupo creado.");
    const { data, error } = await supabase
      .from("trip_groups")
      .select("id,name,created_at,trip_group_items(trip_id,sort_order,starts_on,ends_on)")
      .eq("id", result.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("El servidor no pudo leer la planificación combinada creada.");
    return Response.json({ group: mapGroup(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error, "trip_groups.create");
  }
}
