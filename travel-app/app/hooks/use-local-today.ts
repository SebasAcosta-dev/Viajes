"use client";

import { useSyncExternalStore } from "react";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function subscribeToLocalDay(onChange: () => void): () => void {
  // The minute check updates open forms after midnight and after a timezone change.
  const interval = window.setInterval(onChange, 60_000);
  const handleVisibility = () => {
    if (document.visibilityState === "visible") onChange();
  };
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

export function useLocalToday(): string {
  return useSyncExternalStore(subscribeToLocalDay, todayIso, () => "1970-01-01");
}
