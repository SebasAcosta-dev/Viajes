import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClientMock, authGetUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  authGetUserMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));

import { updateSupabaseSession } from "@/lib/supabase/proxy";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("actualización de sesión en proxy", () => {
  it("no crea un cliente ni bloquea páginas públicas en modo demo", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "demo");
    const response = await updateSupabaseSession(new NextRequest("https://viajes.example/destinos"));
    expect(response.status).toBe(200);
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("refresca sesión y propaga cookies sin redirigir páginas públicas o de visitante", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: null });
    createServerClientMock.mockImplementation((_url: string, _key: string, options: {
      cookies: { setAll: (cookies: { name: string; value: string; options: { path: string } }[]) => void };
    }) => {
      options.cookies.setAll([{ name: "sb-session", value: "refreshed", options: { path: "/" } }]);
      return { auth: { getUser: authGetUserMock } };
    });

    const response = await updateSupabaseSession(new NextRequest("https://viajes.example/destinos"));
    expect(authGetUserMock).toHaveBeenCalledOnce();
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("location")).toBeNull();
  });

  it("permite que la ruta siga disponible si falla la actualización transitoria", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    createServerClientMock.mockReturnValue({ auth: { getUser: vi.fn().mockRejectedValue(new Error("network")) } });
    const response = await updateSupabaseSession(new NextRequest("https://viajes.example/cuenta"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
