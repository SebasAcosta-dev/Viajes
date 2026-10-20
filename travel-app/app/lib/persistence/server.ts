import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export class PersistenceRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "PersistenceRequestError";
  }
}

export async function getAuthenticatedSupabase() {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase") {
    throw new PersistenceRequestError("La persistencia Supabase no está activada.", 404);
  }
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new PersistenceRequestError("Supabase no está configurado en el servidor.", 503);
  }
  const startedAt = performance.now();
  let authResult = "unknown";
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const invalidSession = error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403;
      authResult = error.name === "AuthRetryableFetchError"
        ? "network_error"
        : invalidSession
          ? "invalid_session"
          : "auth_error";
      throw new PersistenceRequestError(
        invalidSession
          ? "Inicia sesión para gestionar tus viajes."
          : "No se pudo verificar la sesión con Supabase. Vuelve a intentarlo.",
        invalidSession ? 401 : 503,
      );
    }
    if (!data.user) {
      authResult = "no_session";
      throw new PersistenceRequestError("Inicia sesión para gestionar tus viajes.", 401);
    }
    authResult = "authenticated";
    return { supabase, user: data.user };
  } catch (error) {
    if (error instanceof PersistenceRequestError) throw error;
    authResult = error instanceof Error && error.name === "AuthRetryableFetchError"
      ? "network_error"
      : "thrown_error";
    throw new PersistenceRequestError("No se pudo verificar la sesión con Supabase. Vuelve a intentarlo.", 503);
  } finally {
    if (process.env.NODE_ENV === "development") {
      console.info("[supabase-auth-timing]", JSON.stringify({
        durationMs: Math.round(performance.now() - startedAt),
        routeKind: "private_api",
        result: authResult,
      }));
    }
  }
}

export function persistenceErrorResponse(error: unknown) {
  if (error instanceof PersistenceRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "No se pudo completar la operación de persistencia." }, { status: 500 });
}
