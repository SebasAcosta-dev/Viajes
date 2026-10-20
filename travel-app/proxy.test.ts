import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy de navegación", () => {
  it.each(["/", "/viajes", "/api/trips"])("continúa %s sin bloquear por autenticación", async (path) => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");

    const response = await proxy(new NextRequest(`http://localhost${path}`));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
