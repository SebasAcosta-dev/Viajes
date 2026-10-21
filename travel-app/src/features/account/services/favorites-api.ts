import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { FavoriteDestination } from "@/lib/persistence/types";

type AppSupabase = SupabaseClient<Database, "public">;

function mapFavorite(row: {
  id: string;
  destination_slug: string;
  created_at: string;
  destinations: unknown;
}): FavoriteDestination {
  const destination = row.destinations as { name: string };
  return { id: row.id, destinationSlug: row.destination_slug, destinationName: destination.name, createdAt: row.created_at };
}

export async function listUserFavorites(supabase: AppSupabase, userId: string): Promise<FavoriteDestination[]> {
  const { data, error } = await supabase.from("favorites")
    .select("id,destination_slug,created_at,destinations!inner(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapFavorite(row as Parameters<typeof mapFavorite>[0]));
}

export async function addUserFavorite(supabase: AppSupabase, userId: string, slug: string): Promise<FavoriteDestination | null> {
  const { data: destination, error: destinationError } = await supabase.from("destinations")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
  if (destinationError) throw destinationError;
  if (!destination) return null;
  const { data, error } = await supabase.from("favorites")
    .insert({ user_id: userId, destination_slug: slug })
    .select("id,destination_slug,created_at,destinations!inner(name)")
    .single();
  if (error) throw error;
  return mapFavorite(data as Parameters<typeof mapFavorite>[0]);
}

export async function removeUserFavorite(supabase: AppSupabase, userId: string, favoriteId: string): Promise<boolean> {
  const { data, error } = await supabase.from("favorites").delete()
    .eq("id", favoriteId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
