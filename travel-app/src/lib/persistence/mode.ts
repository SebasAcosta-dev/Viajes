import type { PersistenceMode } from "@/lib/persistence/types";
import { getPublicEnvironment } from "@/lib/env";
import { localPersistenceAdapter } from "@/lib/persistence/local-adapter";

const VISITOR_MODE_KEY = "viajes.storage-mode.v1";

export function getPersistenceMode(): PersistenceMode {
  return getPublicEnvironment().dataMode;
}

export function isVisitorLocalMode(): boolean {
  return typeof window !== "undefined" && localPersistenceAdapter.getItem(VISITOR_MODE_KEY) === "visitor";
}

export function setVisitorLocalMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) localPersistenceAdapter.setItem(VISITOR_MODE_KEY, "visitor");
  else localPersistenceAdapter.removeItem(VISITOR_MODE_KEY);
}
