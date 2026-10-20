"use client";

import { defaultFavorites, seedTrips } from "@/app/data/demo-data";
import type { FavoriteDestination, SavedExpense, SavedTrip, TripDraft } from "@/app/lib/persistence/types";
import { getPersistenceMode } from "@/app/lib/persistence/mode";
import type { ItineraryItem } from "@/app/lib/types";

const TRIPS_KEY = "viajes.persisted.trips.v1";
const FAVORITES_KEY = "viajes.persisted.favorites.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStored<T>(key: string, fallback: T): T {
  const serialized = localStorage.getItem(key);
  if (!serialized) return fallback;
  try {
    return JSON.parse(serialized) as T;
  } catch {
    throw new Error("Los datos locales están dañados y no se han sobrescrito. Borra el almacenamiento de Viajes para reiniciar el modo demo.");
  }
}

function demoTrips(): SavedTrip[] {
  return readStored(TRIPS_KEY, seedTrips.map((trip) => ({ ...trip, expenses: [] })));
}

function demoFavorites(): FavoriteDestination[] {
  const initial = defaultFavorites
    .filter((favorite) => favorite.type === "destination")
    .map((favorite) => ({
      id: favorite.id,
      destinationSlug: favorite.targetId.replace(/^dest-/, ""),
      destinationName: favorite.targetId.replace(/^dest-/, ""),
      createdAt: favorite.createdAt,
    }));
  return readStored(FAVORITES_KEY, initial);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("El servidor no devolvió una respuesta JSON válida; no se confirmó la operación.");
  }
  if (!isRecord(body)) {
    throw new Error("El servidor devolvió una respuesta inesperada; no se confirmó la operación.");
  }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "No se pudo guardar la información.";
    throw new Error(message);
  }
  return body as T;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizedDraft(draft: TripDraft, id: string, createdAt: string): SavedTrip {
  return {
    id,
    name: draft.name,
    origin: draft.origin ?? "",
    destination: draft.destination,
    startDate: draft.startDate ?? null,
    endDate: draft.endDate ?? null,
    travelers: draft.travelers ?? 1,
    budget: draft.budget,
    currency: draft.currency,
    interests: draft.interests ?? [],
    travelType: draft.travelType ?? "Combinado",
    status: draft.status ?? "borrador",
    itinerary: draft.itinerary,
    expenses: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export async function listTrips(): Promise<SavedTrip[]> {
  if (getPersistenceMode() === "supabase") {
    const result = await api<{ trips?: unknown }>("/api/trips");
    if (!Array.isArray(result.trips)) throw new Error("El servidor no confirmó la lectura de los viajes.");
    return result.trips as SavedTrip[];
  }
  return demoTrips();
}

export async function saveTrip(draft: TripDraft): Promise<SavedTrip> {
  if (getPersistenceMode() === "supabase") {
    const result = await api<{ trip?: unknown }>("/api/trips", { method: "POST", body: JSON.stringify(draft) });
    if (!isRecord(result.trip) || typeof result.trip.id !== "string") {
      throw new Error("El servidor no confirmó el viaje guardado.");
    }
    return result.trip as unknown as SavedTrip;
  }
  const now = new Date().toISOString();
  const trip = normalizedDraft(draft, newId(), now);
  localStorage.setItem(TRIPS_KEY, JSON.stringify([trip, ...demoTrips()]));
  return trip;
}

export async function updateTrip(id: string, changes: Partial<Pick<SavedTrip, "budget" | "currency" | "status">>): Promise<void> {
  if (getPersistenceMode() === "supabase") {
    const result = await api<{ trip?: unknown }>(`/api/trips/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
    if (!isRecord(result.trip) || result.trip.id !== id ||
      (changes.budget !== undefined && result.trip.budget !== changes.budget) ||
      (changes.currency !== undefined && result.trip.currency !== changes.currency) ||
      (changes.status !== undefined && result.trip.status !== changes.status)) {
      throw new Error("El servidor no confirmó los cambios del viaje.");
    }
    return;
  }
  const trips = demoTrips();
  const index = trips.findIndex((trip) => trip.id === id);
  if (index < 0) throw new Error("No se encontró el viaje.");
  trips[index] = { ...trips[index], ...changes, updatedAt: new Date().toISOString() };
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function deleteTrip(id: string): Promise<void> {
  if (getPersistenceMode() === "supabase") {
    const result = await api<{ deleted?: unknown }>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (result.deleted !== true) throw new Error("El servidor no confirmó la eliminación del viaje.");
    return;
  }
  localStorage.setItem(TRIPS_KEY, JSON.stringify(demoTrips().filter((trip) => trip.id !== id)));
}

export async function updateActivity(tripId: string, activity: ItineraryItem): Promise<void> {
  if (getPersistenceMode() === "supabase") {
    const result = await api<{ updated?: unknown }>(`/api/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(activity.id)}`, {
      method: "PATCH",
      body: JSON.stringify(activity),
    });
    if (result.updated !== true) throw new Error("El servidor no confirmó los cambios de la actividad.");
    return;
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  if (!trip) throw new Error("No se encontró el viaje.");
  let found = false;
  trip.itinerary = trip.itinerary.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      if (item.id !== activity.id) return item;
      found = true;
      return activity;
    }),
  }));
  if (!found) throw new Error("No se encontró la actividad.");
  trip.updatedAt = new Date().toISOString();
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function listFavorites(): Promise<FavoriteDestination[]> {
  if (getPersistenceMode() === "supabase") {
    const result = await api<{ favorites?: unknown }>("/api/favorites");
    if (!Array.isArray(result.favorites)) throw new Error("El servidor no confirmó la lectura de los favoritos.");
    return result.favorites as FavoriteDestination[];
  }
  return demoFavorites();
}

export async function toggleFavorite(destinationSlug: string, destinationName: string): Promise<FavoriteDestination[]> {
  if (getPersistenceMode() === "supabase") {
    const current = await listFavorites();
    const favorite = current.find((entry) => entry.destinationSlug === destinationSlug);
    if (favorite) {
      await api(`/api/favorites/${encodeURIComponent(favorite.id)}`, { method: "DELETE" });
    } else {
      await api("/api/favorites", {
        method: "POST",
        body: JSON.stringify({ destinationSlug, destinationName }),
      });
    }
    return listFavorites();
  }
  const favorites = demoFavorites();
  const existing = favorites.find((favorite) => favorite.destinationSlug === destinationSlug);
  const next = existing
    ? favorites.filter((favorite) => favorite.id !== existing.id)
    : [...favorites, { id: newId(), destinationSlug, destinationName, createdAt: new Date().toISOString() }];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export async function addExpense(
  tripId: string,
  expense: Omit<SavedExpense, "id" | "tripId" | "createdAt">,
): Promise<SavedExpense> {
  if (getPersistenceMode() === "supabase") {
    const result = await api<{ expense?: unknown }>(`/api/trips/${encodeURIComponent(tripId)}/expenses`, {
      method: "POST",
      body: JSON.stringify(expense),
    });
    if (!isRecord(result.expense) || typeof result.expense.id !== "string" || result.expense.tripId !== tripId) {
      throw new Error("El servidor no confirmó el gasto guardado.");
    }
    return result.expense as unknown as SavedExpense;
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  if (!trip) throw new Error("No se encontró el viaje.");
  const result = { ...expense, id: newId(), tripId, createdAt: new Date().toISOString() };
  trip.expenses.push(result);
  trip.updatedAt = new Date().toISOString();
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
  return result;
}

export function persistenceLabel(): string {
  return getPersistenceMode() === "supabase" ? "Supabase" : "Demo local (este navegador)";
}
