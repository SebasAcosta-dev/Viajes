import { favoriteDestinationRequestSchema } from "@/features/account/api-schemas";
import { addUserFavorite, listUserFavorites } from "@/features/account/services/favorites-api";
import { parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const favorites = await listUserFavorites(supabase, user.id);
    return Response.json({ favorites });
  } catch (error) {
    return persistenceErrorResponse(error, "favorites.read");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const parsed = await parseJsonBody(request, favoriteDestinationRequestSchema, "El destino favorito no es válido.");
    if (!parsed.ok) return parsed.response;
    const favorite = await addUserFavorite(supabase, user.id, parsed.data.destinationSlug);
    if (!favorite) return Response.json({ error: "El destino no existe en el catálogo." }, { status: 404 });
    return Response.json({ favorite }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error, "favorites.create");
  }
}
