import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/app/lib/persistence/server";

export async function GET() {
  try {
    const { supabase } = await getAuthenticatedSupabase();
    const { data, error } = await supabase
      .from("favorites")
      .select("id,destination_slug,created_at,destinations!inner(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const favorites = (data ?? []).map((row) => {
      const destination = row.destinations as unknown as { name: string };
      return {
        id: row.id,
        destinationSlug: row.destination_slug,
        destinationName: destination.name,
        createdAt: row.created_at,
      };
    });
    return Response.json({ favorites });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json({ error: "El destino favorito no es válido." }, { status: 400 });
    }
    const slug = (body as Record<string, unknown>).destinationSlug;
    if (typeof slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(slug)) {
      return Response.json({ error: "El identificador del destino no es válido." }, { status: 400 });
    }
    const { data: destination, error: destinationError } = await supabase
      .from("destinations")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (destinationError) throw destinationError;
    if (!destination) return Response.json({ error: "El destino no existe en el catálogo." }, { status: 404 });
    const { data, error } = await supabase
      .from("favorites")
      .insert({ user_id: user.id, destination_slug: slug })
      .select("id,destination_slug,created_at,destinations!inner(name)")
      .single();
    if (error) throw error;
    const joinedDestination = data.destinations as unknown as { name: string };
    return Response.json({
      favorite: {
        id: data.id,
        destinationSlug: data.destination_slug,
        destinationName: joinedDestination.name,
        createdAt: data.created_at,
      },
    }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}
