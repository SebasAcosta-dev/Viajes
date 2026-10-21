import type { Json } from "@/lib/database.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toSupabaseJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Supabase JSON numbers must be finite.");
    return value;
  }
  if (Array.isArray(value)) {
    const entries: unknown[] = value;
    return entries.map((entry) => entry === undefined ? null : toSupabaseJson(entry));
  }
  if (isRecord(value)) {
    const json: { [key: string]: Json | undefined } = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) json[key] = toSupabaseJson(entry);
    }
    return json;
  }
  throw new TypeError("Value cannot be represented as Supabase JSON.");
}
