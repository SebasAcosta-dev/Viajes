"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  combineLocationSuggestions,
  normalizeLocationQuery,
  searchPopularLocations,
  type LocationSuggestion,
} from "@/lib/location-search";

interface SearchResponse {
  available: boolean;
  results: LocationSuggestion[];
}

type RemoteSearchState = {
  query: string;
  status: "idle" | "loading" | "success" | "unavailable";
  results: LocationSuggestion[];
};

const recentSearches = new Map<string, { response: SearchResponse; expiresAt: number }>();
const maxCachedSearches = 80;
const recentSearchTtlMs = 5 * 60 * 1000;
const unavailableSearchTtlMs = 10 * 1000;

function cacheSearch(query: string, response: SearchResponse) {
  if (recentSearches.has(query)) recentSearches.delete(query);
  recentSearches.set(query, {
    response,
    expiresAt: Date.now() + (response.available ? recentSearchTtlMs : unavailableSearchTtlMs),
  });
  if (recentSearches.size > maxCachedSearches) {
    const oldest = recentSearches.keys().next().value;
    if (oldest) recentSearches.delete(oldest);
  }
}

export function LocationAutocomplete({
  label,
  value,
  required = false,
  onChange,
  onSelectionChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
  onSelectionChange: (location: LocationSuggestion | undefined) => void;
}) {
  const id = useId();
  const listboxId = `${id}-suggestions`;
  const statusId = `${id}-status`;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [remoteState, setRemoteState] = useState<RemoteSearchState>({
    query: "",
    status: "idle",
    results: [],
  });
  const query = normalizeLocationQuery(value);

  useEffect(() => {
    if (!isOpen || query.length < 2) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const cached = recentSearches.get(query);
      if (cached && cached.expiresAt > Date.now()) {
        setRemoteState({
          query,
          status: cached.response.available ? "success" : "unavailable",
          results: cached.response.results,
        });
        return;
      }
      if (cached) recentSearches.delete(query);

      setRemoteState({ query, status: "loading", results: [] });
      void fetch(`/api/location-search?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal })
        .then(async (response) => {
          const payload: unknown = await response.json();
          if (controller.signal.aborted) return;
          if (!response.ok || !payload || typeof payload !== "object" || !("available" in payload) || !("results" in payload)) {
            throw new Error("Location search is unavailable");
          }
          const available = payload.available === true;
          const results = Array.isArray(payload.results)
            ? payload.results.filter((item): item is LocationSuggestion => (
                !!item && typeof item === "object" && "name" in item && typeof item.name === "string"
                && "country" in item && typeof item.country === "string"
                && "key" in item && typeof item.key === "string"
                && "source" in item && item.source === "geoapify"
              ))
            : [];
          const result = { available, results };
          cacheSearch(query, result);
          setRemoteState({ query, status: available ? "success" : "unavailable", results });
        })
        .catch(() => {
          if (!controller.signal.aborted) setRemoteState({ query, status: "unavailable", results: [] });
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, query, value]);

  // Leave room in the dropdown for remote places outside the small quick-suggestion catalog.
  const localResults = useMemo(() => searchPopularLocations(value, query ? 4 : 8), [query, value]);
  const currentRemoteState = remoteState.query === query ? remoteState : undefined;
  const suggestions = useMemo(() => combineLocationSuggestions(
    value,
    localResults,
    currentRemoteState?.status === "success" ? currentRemoteState.results : [],
  ), [currentRemoteState, localResults, value]);
  const statusMessage = currentRemoteState?.status === "loading"
    ? "Buscando más lugares…"
    : currentRemoteState?.status === "unavailable"
      ? "No se pudieron cargar sugerencias en línea. Puedes seguir escribiendo el lugar."
      : query.length >= 2 && currentRemoteState?.status === "success" && suggestions.length === 0
        ? "No encontramos coincidencias. Puedes usar el texto que has escrito."
        : "";

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    onChange(suggestion.name);
    onSelectionChange(suggestion);
    setActiveIndex(-1);
    setIsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  };

  return (
    <div className="relative min-w-0">
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={`${id}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && suggestions.length > 0}
        aria-controls={isOpen && suggestions.length > 0 ? listboxId : undefined}
        aria-activedescendant={activeIndex >= 0 && suggestions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        aria-describedby={isOpen ? statusId : undefined}
        autoComplete="off"
        required={required}
        value={value}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          onSelectionChange(undefined);
          setActiveIndex(-1);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 px-3"
      />
      {isOpen && (
        <div className="absolute z-30 mt-2 w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {suggestions.length > 0 ? (
            <ul id={listboxId} role="listbox" aria-label={`Sugerencias de ${label}`} className="max-h-72 overflow-y-auto p-2">
              {suggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion.key}-${suggestion.country}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                  className={`cursor-pointer rounded-xl px-3 py-2.5 ${activeIndex === index ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                >
                  <span className="block truncate text-sm font-semibold text-slate-900">{suggestion.name}</span>
                  <span className="block truncate text-xs text-slate-600">
                    {[suggestion.region, suggestion.country].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : !statusMessage ? (
            <p id={statusId} role="status" className="px-4 py-3 text-sm text-slate-600">Escribe para buscar ciudades o usa el lugar que quieras.</p>
          ) : null}
          {statusMessage && <p id={statusId} role="status" className="px-4 py-2 text-xs text-slate-600">{statusMessage}</p>}
          <p className="border-t border-slate-100 px-4 py-2 text-[0.7rem] text-slate-500">
            Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a>
            {" · Datos "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a>
          </p>
        </div>
      )}
    </div>
  );
}
