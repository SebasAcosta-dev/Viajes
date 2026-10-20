import type { PersistenceMode } from "@/app/lib/persistence/types";

const VISITOR_MODE_KEY = "viajes.storage-mode.v1";

export function getPersistenceMode(): PersistenceMode {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "demo";
  if (mode !== "demo" && mode !== "supabase") {
    throw new Error("NEXT_PUBLIC_DATA_MODE debe ser demo o supabase.");
  }
  return mode;
}

export function isVisitorLocalMode(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(VISITOR_MODE_KEY) === "visitor";
}

export function setVisitorLocalMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) window.localStorage.setItem(VISITOR_MODE_KEY, "visitor");
  else window.localStorage.removeItem(VISITOR_MODE_KEY);
}
