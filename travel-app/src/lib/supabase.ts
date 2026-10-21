export const appMode = process.env.NEXT_PUBLIC_APP_MODE ?? "demo";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (appMode === "demo") {
    return { enabled: false, url: "demo", key: "demo" };
  }

  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase. Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  return { enabled: true, url, key };
}
