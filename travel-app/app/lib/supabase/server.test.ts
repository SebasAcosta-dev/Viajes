import { afterEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, cookieStoreMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  cookieStoreMock: {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  },
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStoreMock) }));

import { createSupabaseServerClient } from "@/app/lib/supabase/server";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("cliente SSR de Supabase", () => {
  it("lee y escribe las cookies de sesión en handlers de servidor", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    createServerClientMock.mockReturnValue({ auth: {} });

    await createSupabaseServerClient();
    const options = createServerClientMock.mock.calls[0][2] as {
      cookies: {
        getAll: () => unknown[];
        setAll: (cookies: { name: string; value: string; options: { path: string } }[]) => void;
      };
    };
    const cookie = { name: "sb-access-token", value: "test-token", options: { path: "/" } };

    expect(options.cookies.getAll()).toEqual([]);
    options.cookies.setAll([cookie]);
    expect(cookieStoreMock.set).toHaveBeenCalledWith(cookie.name, cookie.value, cookie.options);
  });
});
