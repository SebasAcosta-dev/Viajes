import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createSupabaseServerClientMock, exchangeCodeForSessionMock, verifyOtpMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  verifyOtpMock: vi.fn(),
}));

vi.mock("@/app/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

import { GET } from "@/app/api/auth/callback/route";

const session = { user: { id: "user-1", email: "ana@example.com" }, access_token: "test-only-token" };

function request(path: string) {
  return new NextRequest(`https://viajes.example.com${path}`);
}

function redirectResult(response: Response) {
  const location = response.headers.get("location");
  if (!location) throw new Error("Expected a redirect location");
  return new URL(location);
}

beforeEach(() => {
  createSupabaseServerClientMock.mockResolvedValue({ auth: {
    exchangeCodeForSession: exchangeCodeForSessionMock,
    verifyOtp: verifyOtpMock,
  } });
  exchangeCodeForSessionMock.mockReset();
  verifyOtpMock.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("callback de autenticación Supabase", () => {
  it("intercambia un código PKCE, mantiene el cliente SSR de cookies y vuelve a Cuenta", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session }, error: null });

    const response = await GET(request("/auth/callback?code=one-time-code&sb_flow_id=flow-1"));
    const destination = redirectResult(response);

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("one-time-code", { flowId: "flow-1" });
    expect(createSupabaseServerClientMock).toHaveBeenCalledOnce();
    expect(destination.origin).toBe("https://viajes.example.com");
    expect(destination.pathname).toBe("/cuenta");
    expect(destination.searchParams.get("auth")).toBe("confirmed");
    expect(destination.search).not.toContain("one-time-code");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("acepta enlaces token_hash con tipos de confirmación permitidos", async () => {
    verifyOtpMock.mockResolvedValue({ data: { session }, error: null });

    const response = await GET(request("/auth/callback?token_hash=one-time-hash&type=email"));

    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: "one-time-hash", type: "email" });
    expect(redirectResult(response).searchParams.get("auth")).toBe("confirmed");
  });

  it("rechaza parámetros incompletos o tipos no permitidos sin llamar a Supabase", async () => {
    const missing = await GET(request("/auth/callback?token_hash=some-hash"));
    const invalidType = await GET(request("/auth/callback?token_hash=some-hash&type=recovery"));

    expect(redirectResult(missing).searchParams.get("auth")).toBe("confirmation_error");
    expect(redirectResult(invalidType).searchParams.get("auth")).toBe("confirmation_error");
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("convierte códigos inválidos y errores devueltos por Supabase en un estado seguro", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: null }, error: new Error("private verifier detail") });

    const invalidCode = await GET(request("/auth/callback?code=invalid-code"));
    const providerError = await GET(request("/auth/callback?error=access_denied&error_description=private"));

    expect(redirectResult(invalidCode).searchParams.get("auth")).toBe("confirmation_error");
    expect(redirectResult(providerError).searchParams.get("auth")).toBe("confirmation_error");
    expect(redirectResult(providerError).search).not.toContain("private");
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("rechaza una solicitud ambigua que contiene code y token_hash", async () => {
    const response = await GET(request("/auth/callback?code=code&token_hash=hash&type=signup"));

    expect(redirectResult(response).searchParams.get("auth")).toBe("confirmation_error");
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });
});
