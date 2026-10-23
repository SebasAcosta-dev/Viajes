import { z } from "zod";
import { getServerEnvironment } from "@/lib/env.server";
import { normalizeLocationQuery, type LocationSuggestion } from "@/lib/location-search";

const querySchema = z.string().trim().min(2).max(80);
const serverCache = new Map<string, { expiresAt: number; results: LocationSuggestion[] }>();
const serverCacheTtlMs = 5 * 60 * 1000;
const maxServerCacheEntries = 200;

interface GeoapifyResult {
  place_id?: unknown;
  name?: unknown;
  city?: unknown;
  village?: unknown;
  town?: unknown;
  country?: unknown;
  state?: unknown;
  county?: unknown;
  lat?: unknown;
  lon?: unknown;
}

function mapGeoapifyResults(value: unknown): LocationSuggestion[] {
  if (!value || typeof value !== "object" || !("results" in value) || !Array.isArray(value.results)) return [];

  const unique = new Map<string, LocationSuggestion>();
  for (const item of value.results as GeoapifyResult[]) {
    if (!item || typeof item !== "object") continue;
    const name = [item.name, item.city, item.town, item.village]
      .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
      ?.trim() ?? "";
    const country = typeof item.country === "string" ? item.country.trim() : "";
    if (!name || !country) continue;
    const aliases = [...new Set([item.city, item.town, item.village]
      .filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0
        && normalizeLocationQuery(alias) !== normalizeLocationQuery(name))
      .map((alias) => alias.trim()))];

    const suggestion: LocationSuggestion = {
      key: typeof item.place_id === "string" && item.place_id ? item.place_id : `${name}:${country}`,
      name,
      country,
      source: "geoapify",
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(typeof item.place_id === "string" && item.place_id ? { geographicId: item.place_id } : {}),
      ...(typeof item.state === "string" && item.state.trim()
        ? { region: item.state.trim() }
        : typeof item.county === "string" && item.county.trim() ? { region: item.county.trim() } : {}),
      ...(typeof item.lat === "number" && Number.isFinite(item.lat) ? { latitude: item.lat } : {}),
      ...(typeof item.lon === "number" && Number.isFinite(item.lon) ? { longitude: item.lon } : {}),
    };
    const uniqueKey = `${normalizeLocationQuery(name)}|${normalizeLocationQuery(suggestion.region ?? "")}|${normalizeLocationQuery(country)}`;
    if (!unique.has(uniqueKey)) unique.set(uniqueKey, suggestion);
    if (unique.size >= 8) break;
  }
  return [...unique.values()];
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = globalThis.crypto?.randomUUID?.() ?? `location-${startedAt}`;
  const queryResult = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!queryResult.success) {
    return Response.json({ available: true, results: [], error: "Escribe al menos dos caracteres para buscar." }, { status: 400 });
  }

  const { geoapifyApiKey } = getServerEnvironment();
  if (!geoapifyApiKey) {
    console.info("Location search unavailable", { requestId, stage: "configuration", durationMs: Date.now() - startedAt });
    return Response.json({ available: false, results: [] }, { status: 503 });
  }

  const normalizedQuery = normalizeLocationQuery(queryResult.data);
  const cached = serverCache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) {
    console.info("Location search completed", {
      requestId, stage: "cache", durationMs: Date.now() - startedAt, resultCount: cached.results.length,
    });
    return Response.json({ available: true, results: cached.results }, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
  if (cached) serverCache.delete(normalizedQuery);

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", queryResult.data);
  url.searchParams.set("type", "city");
  url.searchParams.set("bias", "countrycode:none");
  url.searchParams.set("lang", "es");
  url.searchParams.set("limit", "8");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", geoapifyApiKey);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) {
      console.warn("Location search provider rejected request", {
        requestId, stage: "provider_response", httpStatus: response.status, durationMs: Date.now() - startedAt,
      });
      return Response.json({ available: false, results: [] }, { status: 502, headers: { "X-Request-Id": requestId } });
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("results" in payload) || !Array.isArray(payload.results)) {
      console.warn("Location search provider returned an invalid payload", {
        requestId,
        stage: "provider_payload",
        httpStatus: response.status,
        contentType: response.headers.get("content-type")?.slice(0, 100) ?? null,
        durationMs: Date.now() - startedAt,
      });
      return Response.json({ available: false, results: [] }, { status: 502, headers: { "X-Request-Id": requestId } });
    }
    const results = mapGeoapifyResults(payload);
    serverCache.set(normalizedQuery, { expiresAt: Date.now() + serverCacheTtlMs, results });
    if (serverCache.size > maxServerCacheEntries) {
      const oldest = serverCache.keys().next().value;
      if (oldest) serverCache.delete(oldest);
    }
    console.info("Location search completed", {
      requestId, stage: "provider_response", httpStatus: response.status, durationMs: Date.now() - startedAt,
      resultCount: results.length,
    });
    return Response.json({ available: true, results }, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error: unknown) {
    console.warn("Location search provider failed", {
      requestId,
      stage: "provider_request",
      durationMs: Date.now() - startedAt,
      reason: error instanceof Error && error.name === "TimeoutError" ? "timeout"
        : error instanceof SyntaxError ? "invalid_json" : "network_error",
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ available: false, results: [] }, { status: 502, headers: { "X-Request-Id": requestId } });
  }
}
