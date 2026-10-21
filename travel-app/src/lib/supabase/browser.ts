"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getPublicEnvironment } from "@/lib/env";

let client: SupabaseClient<Database, "public"> | undefined;

export function createSupabaseBrowserClient(): SupabaseClient<Database, "public"> {
  const { supabaseUrl: url, supabasePublishableKey: key } = getPublicEnvironment();
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  client ??= createBrowserClient<Database, "public">(url, key);
  return client;
}
