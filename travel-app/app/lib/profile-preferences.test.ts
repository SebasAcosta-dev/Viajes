import { afterEach, describe, expect, it, vi } from "vitest";
import { getProfilePreferences, saveProfilePreferences } from "@/app/lib/persistence/profile-client";
import { profilePreferencesFromRow, validateProfilePreferences } from "@/app/lib/profile-preferences";

const { createSupabaseBrowserClientMock } = vi.hoisted(() => ({
  createSupabaseBrowserClientMock: vi.fn(),
}));
vi.mock("@/app/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const preferences = {
  name: "Ana",
  language: "es",
  currency: "EUR" as const,
  interests: ["Historia", "Pádel"],
  pace: "equilibrado",
  budgetPreference: "Actividades accesibles",
  travelTypes: ["Cultural" as const],
};

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("preferencias de perfil", () => {
  it("valida preferencias personalizadas y preserva compatibilidad de filas antiguas", () => {
    expect(validateProfilePreferences(preferences)).toEqual(preferences);
    expect(validateProfilePreferences({ ...preferences, currency: "XYZ" })).toBeUndefined();
    expect(profilePreferencesFromRow({
      display_name: "Ana",
      language: "es",
      currency: "EUR",
      preferences: { interests: ["Historia"], legacyField: true },
    })).toMatchObject({ interests: ["Historia"], pace: "equilibrado" });
  });

  it("guarda y recupera preferencias en el almacenamiento local demo", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "demo");
    await saveProfilePreferences(preferences);
    expect(await getProfilePreferences()).toEqual(preferences);
  });

  it("aísla las preferencias locales de cuentas distintas en el mismo navegador", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "demo");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    createSupabaseBrowserClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "account-1" } }, error: null }) },
    });
    await saveProfilePreferences(preferences);

    createSupabaseBrowserClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "account-2" } }, error: null }) },
    });
    expect(await getProfilePreferences()).not.toEqual(preferences);

    createSupabaseBrowserClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "account-1" } }, error: null }) },
    });
    expect(await getProfilePreferences()).toEqual(preferences);
  });

  it("no confirma preferencias de Supabase si la operación falla", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Inicia sesión." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(saveProfilePreferences(preferences)).rejects.toThrow("Inicia sesión.");
  });
});
