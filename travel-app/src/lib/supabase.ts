import { getPublicEnvironment } from "@/lib/env";

export const appMode = getPublicEnvironment().appMode;

export function getSupabaseConfig() {
  const { supabaseUrl: url, supabasePublishableKey: key } = getPublicEnvironment();

  if (appMode === "demo") {
    return { enabled: false, url: "demo", key: "demo" };
  }

  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase. Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  return { enabled: true, url, key };
}
