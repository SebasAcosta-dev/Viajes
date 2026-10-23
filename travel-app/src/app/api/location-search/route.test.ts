import { afterEach, describe, expect, it, vi } from "vitest";

const { getServerEnvironmentMock } = vi.hoisted(() => ({ getServerEnvironmentMock: vi.fn() }));
vi.mock("@/lib/env.server", () => ({ getServerEnvironment: getServerEnvironmentMock }));

import { GET } from "@/app/api/location-search/route";

afterEach(() => {
  vi.restoreAllMocks();
  getServerEnvironmentMock.mockReset();
});

describe("GET /api/location-search", () => {
  it("valida la longitud mínima antes de consultar al proveedor", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/location-search?q=a"));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mantiene disponibles los resultados locales si falta la clave privada", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: undefined });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await GET(new Request("http://localhost/api/location-search?q=bar"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ available: false, results: [] });
    expect(JSON.stringify(info.mock.calls)).toContain('"stage":"configuration"');
  });

  it("consulta Geoapify solo desde el servidor y devuelve metadatos geográficos", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { place_id: "geo-id-1", city: "San Sebastián", country: "España", state: "País Vasco", lat: 43.3183, lon: -1.9812 },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/location-search?q=san%20se"));

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      available: true,
      results: [{
        key: "geo-id-1", geographicId: "geo-id-1", name: "San Sebastián", country: "España",
        region: "País Vasco", latitude: 43.3183, longitude: -1.9812, source: "geoapify",
      }],
    });
    const providerUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(providerUrl.hostname).toBe("api.geoapify.com");
    expect(providerUrl.searchParams.get("apiKey")).toBe("server-only-test-key");
    expect(providerUrl.searchParams.get("type")).toBe("city");
    expect(providerUrl.searchParams.get("bias")).toBe("countrycode:none");
    expect(JSON.stringify(result)).not.toContain("server-only-test-key");
  });

  it("busca una localidad fuera del catálogo local", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { place_id: "larkspur-us", name: "Larkspur", village: "Larkspur", country: "United States", state: "California", lat: 37.9341, lon: -122.5353 },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/location-search?q=lark"));
    const payload = await response.json();

    expect(payload.results).toEqual([
      expect.objectContaining({ name: "Larkspur", region: "California", source: "geoapify" }),
    ]);
  });

  it("envía una búsqueda mundial sin tildes al proveedor y conserva Boyacá como localidad", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { place_id: "boyaca-co", name: "Boyacá", city: "Boyacá", country: "Colombia", state: "Boyacá" },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/location-search?q=boyaca"));
    const payload = await response.json();
    const providerUrl = new URL(String(fetchMock.mock.calls[0]![0]));

    expect(providerUrl.searchParams.get("text")).toBe("boyaca");
    expect(providerUrl.searchParams.get("type")).toBe("city");
    expect(providerUrl.searchParams.get("bias")).toBe("countrycode:none");
    expect(response.status).toBe(200);
    expect(payload.results).toEqual([expect.objectContaining({ name: "Boyacá", country: "Colombia" })]);
  });

  it("mantiene homónimos con regiones distintas en una búsqueda global", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { place_id: "springfield-il", name: "Springfield", city: "Springfield", country: "United States", state: "Illinois" },
      { place_id: "springfield-ma", name: "Springfield", city: "Springfield", country: "United States", state: "Massachusetts" },
    ] }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await GET(new Request("http://localhost/api/location-search?q=springfield"));
    const payload = await response.json();

    expect(payload.results).toHaveLength(2);
    expect(payload.results.map((place: { region: string }) => place.region)).toEqual(["Illinois", "Massachusetts"]);
  });
  it("acepta búsquedas con caracteres internacionales y devuelve cero resultados válidos sin fallar", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/location-search?q=%E6%9D%B1%E4%BA%AC"));
    const url = new URL(String(fetchMock.mock.calls[0]![0]));

    expect(response.status).toBe(200);
    expect(url.searchParams.get("text")).toBe("東京");
    expect(await response.json()).toMatchObject({ available: true, results: [] });
  });

  it("distingue un payload de proveedor mal formado de una búsqueda válida sin resultados", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ unexpected: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const response = await GET(new Request("http://localhost/api/location-search?q=bad-payload"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ available: false, results: [] });
    expect(JSON.stringify(warning.mock.calls)).toContain('"stage":"provider_payload"');
  });

  it("informa de indisponibilidad sin ocultar sugerencias locales del cliente", async () => {
    getServerEnvironmentMock.mockReturnValue({ geoapifyApiKey: "server-only-test-key" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));

    const response = await GET(new Request("http://localhost/api/location-search?q=san"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ available: false, results: [] });
  });
});
