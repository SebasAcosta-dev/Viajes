import { describe, expect, it, vi } from "vitest";
import { parsePublicEnvironment } from "@/lib/env";
import { parseServerEnvironment } from "@/lib/env.server";

vi.mock("server-only", () => ({}));

describe("validación del entorno", () => {
  it("mantiene demo y visitante cuando no hay configuración pública opcional", () => {
    expect(parsePublicEnvironment({})).toMatchObject({ appMode: "demo", dataMode: "demo" });
  });

  it("valida el modo Supabase y sus campos públicos sin exponer configuración privada", () => {
    expect(parsePublicEnvironment({
      NEXT_PUBLIC_DATA_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    })).toMatchObject({ dataMode: "supabase", supabaseUrl: "https://example.supabase.co" });
    expect(() => parsePublicEnvironment({ NEXT_PUBLIC_DATA_MODE: "remote" })).toThrow();
  });

  it("valida las variables de IA por separado en el esquema exclusivamente servidor", () => {
    expect(parseServerEnvironment({})).toEqual({ aiApiKey: undefined, aiProvider: undefined, aiModel: undefined });
    expect(parseServerEnvironment({ AI_API_KEY: "server-test-key" }).aiApiKey).toBe("server-test-key");
    expect(() => parseServerEnvironment({ AI_API_KEY: "" })).not.toThrow();
  });
});
