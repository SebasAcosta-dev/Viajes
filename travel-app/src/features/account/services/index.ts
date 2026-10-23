import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ProfilePreferences } from "@/lib/types";
import { profilePreferencesFromRow } from "@/lib/profile-preferences";

type AppSupabase = SupabaseClient<Database, "public">;

export async function getAccountPreferences(supabase: AppSupabase, userId: string): Promise<ProfilePreferences | null> {
  const { data, error } = await supabase.from("profiles")
    .select("display_name,preferences,currency,language")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return profilePreferencesFromRow(data) ?? null;
}
