import type { ItineraryPlan } from "@/app/lib/ai";
import type { TripFormValues } from "@/app/lib/types";

export interface GeneratedItineraryDraft {
  form: TripFormValues;
  itinerary: ItineraryPlan;
  source: "openrouter" | "demo";
  model?: string;
  generatedAt: string;
}

const STORAGE_KEY = "viajes.generated-itinerary.v1";
const FORM_STORAGE_KEY = "viajes.trip-form-draft.v1";

function scopedStorageKey(key: string, scope: string): string {
  return `${key}.${encodeURIComponent(scope)}`;
}

export function saveGeneratedItinerary(draft: GeneratedItineraryDraft, scope = "anonymous"): void {
  localStorage.setItem(scopedStorageKey(STORAGE_KEY, scope), JSON.stringify(draft));
}

export function loadGeneratedItinerary(scope = "anonymous"): GeneratedItineraryDraft | null {
  const key = scopedStorageKey(STORAGE_KEY, scope);
  const serialized = localStorage.getItem(key) ??
    (scope === "anonymous" ? localStorage.getItem(STORAGE_KEY) : null);
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("El itinerario guardado tiene un formato inválido.");
    }
    const draft = value as Partial<GeneratedItineraryDraft>;
    if (
      !draft.form || !draft.itinerary || (draft.source !== "openrouter" && draft.source !== "demo") ||
      typeof draft.generatedAt !== "string"
    ) throw new Error("El itinerario guardado tiene un formato inválido.");
    return draft as GeneratedItineraryDraft;
  } catch (error) {
    if (error instanceof Error && error.message === "El itinerario guardado tiene un formato inválido.") throw error;
    throw new Error("El itinerario guardado está dañado y no se ha sobrescrito.");
  }
}

export function saveTripFormDraft(form: TripFormValues, scope = "anonymous"): void {
  const isAnonymous = scope === "anonymous" || scope.startsWith("anonymous:");
  const value = isAnonymous ? form : { ...form, interests: [] };
  localStorage.setItem(scopedStorageKey(FORM_STORAGE_KEY, scope), JSON.stringify(value));
}

export function loadTripFormDraft(scope = "anonymous"): TripFormValues | null {
  const key = scopedStorageKey(FORM_STORAGE_KEY, scope);
  const serialized = localStorage.getItem(key) ??
    (scope === "anonymous" ? localStorage.getItem(FORM_STORAGE_KEY) : null);
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const form = value as Partial<TripFormValues>;
    if (
      typeof form.origin !== "string" || typeof form.destination !== "string" ||
      typeof form.startDate !== "string" || typeof form.endDate !== "string" ||
      typeof form.travelers !== "number" || typeof form.budget !== "number" ||
      !Array.isArray(form.interests) || typeof form.travelType !== "string" ||
      typeof form.pace !== "string" || typeof form.notes !== "string"
    ) return null;
    return form as TripFormValues;
  } catch {
    throw new Error("El formulario guardado está dañado y no se ha sobrescrito.");
  }
}
