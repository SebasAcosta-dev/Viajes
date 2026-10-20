import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

const { cookieStoreMock, createServerClientMock } = vi.hoisted(() => ({
  cookieStoreMock: {
    getAll: vi.fn(() => [{ name: "sb-access-token", value: "initial-test-token" }]),
    set: vi.fn(),
  },
  createServerClientMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStoreMock),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("cookies de Supabase en rutas servidor", () => {
  it("pasa la cookie de sesión al cliente y persiste las cookies renovadas", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    createServerClientMock.mockReturnValue({} as never);

    await createSupabaseServerClient();

    const options = vi.mocked(createServerClient).mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual([{ name: "sb-access-token", value: "initial-test-token" }]);
    const renewedCookie = {
      name: "sb-access-token",
      value: "renewed-test-token",
      options: { path: "/", httpOnly: true },
    };
    options.cookies.setAll([renewedCookie]);
    expect(cookieStoreMock.set).toHaveBeenCalledWith(
      renewedCookie.name,
      renewedCookie.value,
      renewedCookie.options,
    );
  });
});
