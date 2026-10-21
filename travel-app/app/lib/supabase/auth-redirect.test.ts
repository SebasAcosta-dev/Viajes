import { describe, expect, it } from "vitest";
import { getAuthCallbackUrl } from "@/app/lib/supabase/auth-redirect";

describe("URL de retorno de autenticación", () => {
  it("devuelve las confirmaciones al origen local durante el desarrollo", () => {
    expect(getAuthCallbackUrl("http://localhost:3000", "https://viajes.example.com"))
      .toBe("http://localhost:3000/auth/callback");
  });

  it("usa el dominio configurado en producción", () => {
    expect(getAuthCallbackUrl("https://viajes-abc.vercel.app", "https://viajes.example.com/base"))
      .toBe("https://viajes.example.com/auth/callback");
  });

  it("evita enviar una confirmación de producción a un NEXT_PUBLIC_SITE_URL local obsoleto", () => {
    expect(getAuthCallbackUrl("https://viajes-abc.vercel.app", "http://localhost:3000"))
      .toBe("https://viajes-abc.vercel.app/auth/callback");
  });

  it("usa el origen de la preview cuando no hay URL canónica configurada", () => {
    expect(getAuthCallbackUrl("https://viajes.example.com", "https://viajes.example.com", {
      environment: "preview",
      url: "viajes-git-feature-team.vercel.app",
      productionUrl: "viajes.example.com",
    })).toBe("https://viajes-git-feature-team.vercel.app/auth/callback");
  });

  it("usa el dominio de producción de Vercel si falta NEXT_PUBLIC_SITE_URL", () => {
    expect(getAuthCallbackUrl("https://deployment-id.vercel.app", undefined, {
      environment: "production",
      url: "deployment-id.vercel.app",
      productionUrl: "viajes.example.com",
    })).toBe("https://viajes.example.com/auth/callback");
  });

  it("rechaza protocolos distintos de HTTP y HTTPS", () => {
    expect(() => getAuthCallbackUrl("javascript:alert(1)")).toThrow("HTTP o HTTPS");
  });
});
