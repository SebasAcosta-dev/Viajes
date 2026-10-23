import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEnvironment } from "@/lib/env";
import { apiErrorResponse, type ApiErrorCode } from "@/lib/api/http";

export class PersistenceRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "PersistenceRequestError";
  }
}

export async function getAuthenticatedSupabase() {
  let dataMode: string;
  try {
    dataMode = getPublicEnvironment().dataMode;
  } catch {
    throw new PersistenceRequestError("La configuración pública de persistencia no es válida.", 503);
  }
  if (dataMode !== "supabase") {
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
  schema?: string;
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
  const postgrestTableMatch = message.match(/could not find the table\s+["']([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)["']\s+in the schema cache/i);
  return {
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.status === "number" ? { status: candidate.status } : {}),
    ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
    ...(postgrestTableMatch ? { schema: postgrestTableMatch[1], table: postgrestTableMatch[2] } : {}),
    ...(columnMatch ? { column: columnMatch[1], table: columnMatch[2] } : {}),
    ...(constraintMatch ? { constraint: constraintMatch[1] } : {}),
  };
}

export function getSupabaseApiHost(): string | undefined {
  try {
    const configuredUrl = getPublicEnvironment().supabaseUrl;
    if (!configuredUrl) return undefined;
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    return parsed.hostname;
  } catch {
    return undefined;
  }
}

export function persistenceErrorResponse(error: unknown, operation = "persistence.unknown") {
  if (error instanceof PersistenceRequestError) {
    const code: ApiErrorCode = error.status === 401 ? "UNAUTHENTICATED"
      : error.status === 403 ? "FORBIDDEN"
        : "PERSISTENCE_ERROR";
    return apiErrorResponse(error.message, error.status, code);
  }
  const metadata = databaseErrorMetadata(error);
  console.error("[supabase-persistence-error]", {
    operation,
    ...metadata,
    ...(metadata.code === "PGRST205" ? { supabaseHost: getSupabaseApiHost() ?? "unavailable" } : {}),
  });
  if (metadata.code === "42501") {
    return apiErrorResponse("Supabase denegó la operación. Comprueba que la sesión y los permisos de este usuario sean válidos.", 403, "FORBIDDEN");
  }
  if (metadata.code === "23502" || metadata.code === "23503" || metadata.code === "23505" || metadata.code === "22P02" || metadata.code === "22007") {
    return apiErrorResponse("Supabase rechazó algunos datos del viaje o perfil. Revisa los campos indicados e inténtalo de nuevo.", 400, "VALIDATION_ERROR");
  }
  if (metadata.code === "PGRST205") {
    const resource = metadata.schema && metadata.table ? `${metadata.schema}.${metadata.table}` : "la tabla solicitada";
    return apiErrorResponse(`La Data API no encuentra ${resource} en el proyecto Supabase configurado. Verifica NEXT_PUBLIC_SUPABASE_URL y los privilegios de exposición para authenticated; consulta la migración de permisos de Data API.`, 503, "PERSISTENCE_ERROR");
  }
  if (metadata.code === "42703" || metadata.code === "PGRST204" || metadata.code === "PGRST202") {
    return apiErrorResponse("El esquema de Supabase no coincide con la versión de la aplicación. Revisa las migraciones requeridas.", 503, "PERSISTENCE_ERROR");
  }
  return apiErrorResponse("No se pudo completar la operación de persistencia. El error técnico se ha registrado de forma segura.", 500, "PERSISTENCE_ERROR");
}
