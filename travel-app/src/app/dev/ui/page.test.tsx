import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import UiPreviewPage from "@/app/dev/ui/page";

afterEach(() => vi.unstubAllEnvs());

describe("catálogo de componentes", () => {
  it("renderiza la previsualización en desarrollo", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(UiPreviewPage()).toBeTruthy();
  });

  it("responde como ruta inexistente fuera de desarrollo", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => UiPreviewPage()).toThrow("NEXT_NOT_FOUND");
  });
});
