import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/app/lib/persistence/server";

export async function DELETE(_request: Request, context: { params: Promise<{ favoriteId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { favoriteId } = await context.params;
    const { data, error } = await supabase.from("favorites").delete()
      .eq("id", favoriteId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el favorito o no tienes permiso para eliminarlo." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return persistenceErrorResponse(error, "favorites.delete");
  }
}
