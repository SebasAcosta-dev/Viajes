import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/lib/persistence/server";
import { profilePreferencesFromRow, validateProfilePreferences } from "@/lib/profile-preferences";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapPreferences(row: unknown) {
  const preferences = profilePreferencesFromRow(row);
  if (!preferences) throw new Error("Los datos del perfil no tienen un formato compatible.");
  return preferences;
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name,preferences,currency,language")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el perfil de esta cuenta." }, { status: 404 });
    return Response.json({ preferences: mapPreferences(data) });
  } catch (error) {
    return persistenceErrorResponse(error, "profile.read");
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const body: unknown = await request.json().catch(() => null);
    const preferences = validateProfilePreferences(body);
    if (!preferences) return Response.json({ error: "Las preferencias del perfil no son válidas." }, { status: 400 });
    const { data: current, error: readError } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return Response.json({ error: "No se encontró el perfil de esta cuenta." }, { status: 404 });
    const existingPreferences = isRecord(current.preferences) ? current.preferences : {};
    const { data, error } = await supabase
      .from("profiles")
      .update({
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
      })
      .eq("id", user.id)
      .select("display_name,preferences,currency,language")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el perfil de esta cuenta." }, { status: 404 });
    return Response.json({ preferences: mapPreferences(data) });
  } catch (error) {
    return persistenceErrorResponse(error, "profile.update");
  }
}
