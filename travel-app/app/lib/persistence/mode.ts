import type { PersistenceMode } from "@/app/lib/persistence/types";

export function getPersistenceMode(): PersistenceMode {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "demo";
  if (mode !== "demo" && mode !== "supabase") {
    throw new Error("NEXT_PUBLIC_DATA_MODE debe ser demo o supabase.");
  }
  return mode;
}
