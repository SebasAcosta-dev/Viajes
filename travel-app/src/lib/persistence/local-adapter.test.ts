import { describe, expect, it } from "vitest";
import { localPersistenceAdapter } from "@/lib/persistence/local-adapter";

describe("adaptador de almacenamiento local", () => {
  it("lee, escribe y elimina datos JSON en el almacenamiento visitante", () => {
    localPersistenceAdapter.writeJson("visitor-test", { name: "Viaje local" });
    expect(localPersistenceAdapter.readJson("visitor-test", null, "datos inválidos")).toEqual({ name: "Viaje local" });
    localPersistenceAdapter.removeItem("visitor-test");
    expect(localPersistenceAdapter.getItem("visitor-test")).toBeNull();
  });

  it("mantiene separado el almacenamiento de sesión del almacenamiento local", () => {
    localPersistenceAdapter.setItem("scope-test", "session", "session");
    expect(localPersistenceAdapter.getItem("scope-test", "session")).toBe("session");
    expect(localPersistenceAdapter.getItem("scope-test")).toBeNull();
  });
});
