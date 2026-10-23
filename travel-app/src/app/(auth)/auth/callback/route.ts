import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const confirmationTypes = new Set<EmailOtpType>(["signup", "email", "invite"]);

function accountRedirect(requestUrl: URL, result: "confirmed" | "confirmation_error") {
  const target = new URL("/cuenta", requestUrl.origin);
  target.searchParams.set("auth", result);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { code, token_hash: tokenHash, type, sb_flow_id: flowId } = Object.fromEntries(
    requestUrl.searchParams,
  );

  if (requestUrl.searchParams.has("error") || requestUrl.searchParams.has("error_code")) {
    return accountRedirect(requestUrl, "confirmation_error");
  }

  if (Boolean(code) === Boolean(tokenHash)) {
    return accountRedirect(requestUrl, "confirmation_error");
  }
  if (!code && (!tokenHash || !type || !confirmationTypes.has(type as EmailOtpType))) {
    return accountRedirect(requestUrl, "confirmation_error");
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (error || !data.session) return accountRedirect(requestUrl, "confirmation_error");
      return accountRedirect(requestUrl, "confirmed");
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error || !data.session) return accountRedirect(requestUrl, "confirmation_error");
    return accountRedirect(requestUrl, "confirmed");
  } catch {
    return accountRedirect(requestUrl, "confirmation_error");
  }
}
