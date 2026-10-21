import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { DatabaseWithNullableTripGroupDates } from "@/lib/supabase/trip-groups";
import { getPublicEnvironment } from "@/lib/env";

export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { dataMode, supabaseUrl, supabasePublishableKey } = getPublicEnvironment();

  if (dataMode !== "supabase" || !supabaseUrl || !supabasePublishableKey) return response;

  const supabase = createServerClient<DatabaseWithNullableTripGroupDates, "public">(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // The route handler remains responsible for authorization; a transient
    // refresh failure must not block public or visitor pages.
  }

  return response;
}
