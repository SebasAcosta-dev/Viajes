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
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new PersistenceRequestError("Inicia sesión para gestionar tus viajes.", 401);
  }
  return { supabase, user: data.user };
}

export function persistenceErrorResponse(error: unknown) {
  if (error instanceof PersistenceRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "No se pudo completar la operación de persistencia." }, { status: 500 });
}
