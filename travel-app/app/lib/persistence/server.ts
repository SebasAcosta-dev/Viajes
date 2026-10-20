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

function databaseErrorMetadata(error: unknown): {
  code?: string;
  status?: number;
  name?: string;
  column?: string;
  table?: string;
  constraint?: string;
} {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as { code?: unknown; status?: unknown; name?: unknown };
  const message = typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : "";
  const columnMatch = message.match(/column\s+["']?([a-z_][a-z0-9_]*)["']?\s+of\s+(?:relation|table)\s+["']?([a-z_][a-z0-9_]*)/i)
    ?? message.match(/could not find the\s+["']([a-z_][a-z0-9_]*)["']\s+column of\s+["']([a-z_][a-z0-9_]*)["']/i);
  const constraintMatch = message.match(/constraint\s+["']([a-z_][a-z0-9_]*)["']/i);
  return {
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.status === "number" ? { status: candidate.status } : {}),
    ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
    ...(columnMatch ? { column: columnMatch[1], table: columnMatch[2] } : {}),
    ...(constraintMatch ? { constraint: constraintMatch[1] } : {}),
  };
}

export function persistenceErrorResponse(error: unknown, operation = "persistence.unknown") {
  if (error instanceof PersistenceRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const metadata = databaseErrorMetadata(error);
  console.error("[supabase-persistence-error]", {
    operation,
    ...metadata,
  });
  if (metadata.code === "42501") {
    return Response.json({ error: "Supabase denegó la operación. Comprueba que la sesión y los permisos de este usuario sean válidos." }, { status: 403 });
  }
  if (metadata.code === "23502" || metadata.code === "23503" || metadata.code === "23505" || metadata.code === "22P02" || metadata.code === "22007") {
    return Response.json({ error: "Supabase rechazó algunos datos del viaje o perfil. Revisa los campos indicados e inténtalo de nuevo." }, { status: 400 });
  }
  if (metadata.code === "42703" || metadata.code === "PGRST204" || metadata.code === "PGRST202") {
    return Response.json({ error: "El esquema de Supabase no coincide con la versión de la aplicación. Revisa las migraciones requeridas." }, { status: 503 });
  }
  return Response.json({ error: "No se pudo completar la operación de persistencia. El error técnico se ha registrado de forma segura." }, { status: 500 });
}
