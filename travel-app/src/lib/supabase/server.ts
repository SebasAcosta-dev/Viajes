import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatabaseWithNullableTripGroupDates } from "@/lib/supabase/trip-groups";
import { getPublicEnvironment } from "@/lib/env";

export async function createSupabaseServerClient(): Promise<SupabaseClient<DatabaseWithNullableTripGroupDates, "public">> {
  const { supabaseUrl: url, supabasePublishableKey: key } = getPublicEnvironment();
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  const cookieStore = await cookies();
  return createServerClient<DatabaseWithNullableTripGroupDates, "public">(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Route handlers and proxy refresh cookies; server components may be read-only.
        }
      },
    },
  });
}
