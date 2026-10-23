import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ProfilePreferences } from "@/lib/types";
import { profilePreferencesFromRow } from "@/lib/profile-preferences";

type AppSupabase = SupabaseClient<Database, "public">;

export async function readProfilePreferences(supabase: AppSupabase, userId: string): Promise<ProfilePreferences | null> {
  const { data, error } = await supabase.from("profiles")
    .select("display_name,preferences,currency,language")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return profilePreferencesFromRow(data) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function writeProfilePreferences(
  supabase: AppSupabase,
  userId: string,
  preferences: ProfilePreferences,
): Promise<ProfilePreferences | null> {
  const { data: current, error: readError } = await supabase.from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return null;
  const existingPreferences = isRecord(current.preferences) ? current.preferences : {};
  const { data, error } = await supabase.from("profiles").update({
    display_name: preferences.name,
    preferences: {
      ...existingPreferences,
      interests: preferences.interests,
      pace: preferences.pace,
      budgetPreference: preferences.budgetPreference,
      travelTypes: preferences.travelTypes,
    },
    currency: preferences.currency,
    language: preferences.language,
  }).eq("id", userId).select("display_name,preferences,currency,language").maybeSingle();
  if (error) throw error;
  return profilePreferencesFromRow(data) ?? null;
}
