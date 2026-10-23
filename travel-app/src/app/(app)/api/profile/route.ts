import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/lib/persistence/server";
import { parseJsonBody } from "@/lib/api/http";
import { profilePreferencesRequestSchema } from "@/features/account/api-schemas";
import { readProfilePreferences, writeProfilePreferences } from "@/features/account/services/profile-api";

const profileMissingMessage = "No se encontr\u00f3 el perfil de esta cuenta.";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const preferences = await readProfilePreferences(supabase, user.id);
    if (!preferences) return Response.json({ error: profileMissingMessage, code: "NOT_FOUND" }, { status: 404 });
    return Response.json({ preferences });
  } catch (error) {
    return persistenceErrorResponse(error, "profile.read");
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const parsed = await parseJsonBody(request, profilePreferencesRequestSchema, "El cuerpo de la solicitud debe ser JSON v\u00e1lido.");
    if (!parsed.ok) return parsed.response;
    const preferences = await writeProfilePreferences(supabase, user.id, parsed.data);
    if (!preferences) return Response.json({ error: profileMissingMessage, code: "NOT_FOUND" }, { status: 404 });
    return Response.json({ preferences });
  } catch (error) {
    return persistenceErrorResponse(error, "profile.update");
  }
}
