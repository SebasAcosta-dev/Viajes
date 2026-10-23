"use client";

import { defaultFavorites, seedTrips } from "@/lib/data/demo-data";
import type { FavoriteDestination, SavedExpense, SavedTrip, SavedTripGroup, SavedTripSummary, TripDraft, TripUpdates } from "@/lib/persistence/types";
import { getPersistenceMode, isVisitorLocalMode, setVisitorLocalMode } from "@/lib/persistence/mode";
import { localTodayIso, normalizeNewTripDates } from "@/lib/trip-dates";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";
import { LOCAL_DATA_CORRUPTION_MESSAGE, localPersistenceAdapter } from "@/lib/persistence/local-adapter";

const TRIPS_KEY = "viajes.persisted.trips.v1";
const FAVORITES_KEY = "viajes.persisted.favorites.v1";
const TRIP_GROUPS_KEY = "viajes.persisted.trip-groups.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStored<T>(key: string, fallback: T): T {
  return localPersistenceAdapter.readJson(key, fallback, LOCAL_DATA_CORRUPTION_MESSAGE);
}

function demoTrips(): SavedTrip[] {
  const fallback = getPersistenceMode() === "demo" ? seedTrips.map((trip) => ({ ...trip, expenses: [] })) : [];
  return readStored(TRIPS_KEY, fallback);
}

function shouldUseSupabase(): boolean {
  return getPersistenceMode() === "supabase" && !isVisitorLocalMode();
}

function demoFavorites(): FavoriteDestination[] {
  const initial = (getPersistenceMode() === "demo" ? defaultFavorites : [])
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
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-User-Time-Zone": timeZone,
      ...init?.headers,
    },
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
  if (shouldUseSupabase()) {
    const result = await api<{ trips?: unknown }>("/api/trips");
    if (!Array.isArray(result.trips)) throw new Error("El servidor no confirmó la lectura de los viajes.");
    return result.trips as SavedTrip[];
  }
  return demoTrips();
}

export async function listTripSummaries(): Promise<SavedTripSummary[]> {
  if (shouldUseSupabase()) {
    const result = await api<{ trips?: unknown }>("/api/trips?summary=1");
    if (!Array.isArray(result.trips)) throw new Error("El servidor no confirmó la lectura resumida de los viajes.");
    return result.trips as SavedTripSummary[];
  }
  return (await listTrips()).slice(0, 50).map(({ id, name, destination, status, startDate, endDate, budget, currency }) => ({
    id, name, destination, status, startDate, endDate, budget, currency,
  }));
}

export async function saveTrip(draft: TripDraft, options: { generationRequestId?: string } = {}): Promise<SavedTrip> {
  const normalizedTripDraft = normalizeNewTripDates(draft, localTodayIso());
  if (shouldUseSupabase()) {
    const result = await api<{ trip?: unknown }>("/api/trips", {
      method: "POST",
      body: JSON.stringify(normalizedTripDraft),
      ...(options.generationRequestId ? { headers: { "X-Generation-Request-Id": options.generationRequestId } } : {}),
    });
    if (!isRecord(result.trip) || typeof result.trip.id !== "string") {
      throw new Error("El servidor no confirmó el viaje guardado.");
    }
    return result.trip as unknown as SavedTrip;
  }
  const now = new Date().toISOString();
  const trip = normalizedDraft(normalizedTripDraft, newId(), now);
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify([trip, ...demoTrips()]));
  return trip;
}

export async function updateTrip(id: string, changes: TripUpdates): Promise<void> {
  if (shouldUseSupabase()) {
    const result = await api<{ trip?: unknown }>(`/api/trips/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
    if (!isRecord(result.trip) || result.trip.id !== id ||
      (changes.budget !== undefined && result.trip.budget !== changes.budget) ||
      (changes.currency !== undefined && result.trip.currency !== changes.currency) ||
      (changes.status !== undefined && result.trip.status !== changes.status) ||
      Object.entries(changes).some(([key, value]) => (result.trip as Record<string, unknown>)[key] !== value)) {
      throw new Error("El servidor no confirmó los cambios del viaje.");
    }
    return;
  }
  const trips = demoTrips();
  const index = trips.findIndex((trip) => trip.id === id);
  if (index < 0) throw new Error("No se encontró el viaje.");
  trips[index] = { ...trips[index], ...changes, updatedAt: new Date().toISOString() };
  if (changes.startDate !== undefined) {
    trips[index].itinerary = trips[index].itinerary.map((day) => ({
      ...day,
      date: changes.startDate ? new Date(Date.parse(`${changes.startDate}T00:00:00Z`) + (day.dayNumber - 1) * 86_400_000).toISOString().slice(0, 10) : undefined,
    }));
  }
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function deleteTrip(id: string): Promise<void> {
  if (shouldUseSupabase()) {
    const result = await api<{ deleted?: unknown }>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (result.deleted !== true) throw new Error("El servidor no confirmó la eliminación del viaje.");
    return;
  }
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(demoTrips().filter((trip) => trip.id !== id)));
}

export async function updateActivity(tripId: string, activity: ItineraryItem): Promise<void> {
  if (shouldUseSupabase()) {
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
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function createActivity(
  tripId: string,
  day: ItineraryDay,
  activity: Pick<ItineraryItem, "name" | "description" | "startTime" | "endTime" | "durationMinutes" | "location" | "blockType">,
): Promise<{ orderUpdated: boolean; orderErrorCode?: string }> {
  if (!activity.startTime || !activity.endTime) throw new Error("Indica las horas de inicio y finalización.");
  if (shouldUseSupabase()) {
    const result = await api<{ created?: unknown; orderUpdated?: unknown; orderErrorCode?: unknown }>(
      `/api/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(day.id)}/activities`,
      { method: "POST", body: JSON.stringify({ ...activity, blockType: activity.blockType ?? "activity" }) },
    );
    if (result.created !== true || typeof result.orderUpdated !== "boolean") {
      throw new Error("El servidor no confirmó la creación de la actividad.");
    }
    return {
      orderUpdated: result.orderUpdated,
      ...(typeof result.orderErrorCode === "string" ? { orderErrorCode: result.orderErrorCode } : {}),
    };
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  const targetDay = trip?.itinerary.find((entry) => entry.id === day.id);
  if (!trip || !targetDay) throw new Error("No se encontró la jornada.");
  const created: ItineraryItem = {
    ...activity,
    id: newId(),
    blockType: activity.blockType ?? "activity",
    currency: trip.currency,
    order: targetDay.items.length + 1,
    notes: "",
    source: "desconocido",
    priceStatus: "unknown",
  };
  targetDay.items = [...targetDay.items, created].sort((left, right) => (left.startTime ?? "99:99").localeCompare(right.startTime ?? "99:99")
    || (left.endTime ?? "99:99").localeCompare(right.endTime ?? "99:99"))
    .map((item, index) => ({ ...item, order: index + 1 }));
  trip.updatedAt = new Date().toISOString();
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
  return { orderUpdated: true };
}

export async function deleteActivity(tripId: string, dayId: string, activityId: string): Promise<void> {
  if (shouldUseSupabase()) {
    const result = await api<{ deleted?: unknown }>(
      `/api/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(activityId)}`,
      { method: "DELETE" },
    );
    if (result.deleted !== true) throw new Error("El servidor no confirmó la eliminación de la actividad.");
    return;
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  const day = trip?.itinerary.find((entry) => entry.id === dayId);
  if (!trip || !day) throw new Error("No se encontró la jornada.");
  if (!day.items.some((item) => item.id === activityId)) throw new Error("No se encontró la actividad.");
  day.items = day.items.filter((item) => item.id !== activityId).map((item, index) => ({ ...item, order: index + 1 }));
  trip.expenses = trip.expenses.map((expense) => expense.activityId === activityId
    ? { ...expense, activityId: undefined }
    : expense);
  trip.updatedAt = new Date().toISOString();
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function reorderActivities(tripId: string, dayId: string, activityIds: string[]): Promise<void> {
  if (shouldUseSupabase()) {
    const result = await api<{ reordered?: unknown }>(
      `/api/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(dayId)}/activities/reorder`,
      { method: "POST", body: JSON.stringify({ activityIds }) },
    );
    if (result.reordered !== true) throw new Error("El servidor no confirmó el nuevo orden de actividades.");
    return;
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  const day = trip?.itinerary.find((entry) => entry.id === dayId);
  if (!trip || !day || activityIds.length !== day.items.length
    || new Set(activityIds).size !== activityIds.length
    || activityIds.some((id) => !day.items.some((activity) => activity.id === id))) {
    throw new Error("El orden de actividades no coincide con la jornada.");
  }
  const items = new Map(day.items.map((activity) => [activity.id, activity]));
  day.items = activityIds.map((id, index) => ({ ...items.get(id)!, order: index + 1 }));
  trip.updatedAt = new Date().toISOString();
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function replaceTripDay(tripId: string, dayNumber: number, day: ItineraryDay): Promise<void> {
  if (shouldUseSupabase()) {
    const result = await api<{ updated?: unknown }>(
      `/api/trips/${encodeURIComponent(tripId)}/days/${dayNumber}/regenerate`,
      { method: "POST", body: JSON.stringify({ day }) },
    );
    if (result.updated !== true) throw new Error("El servidor no confirmó la sustitución de la jornada.");
    return;
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  if (!trip) throw new Error("No se encontró el viaje.");
  const index = trip.itinerary.findIndex((entry) => entry.dayNumber === dayNumber);
  if (index < 0 || day.dayNumber !== dayNumber) throw new Error("No se encontró la jornada que se va a sustituir.");
  trip.itinerary[index] = day;
  trip.updatedAt = new Date().toISOString();
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function listFavorites(): Promise<FavoriteDestination[]> {
  if (shouldUseSupabase()) {
    const result = await api<{ favorites?: unknown }>("/api/favorites");
    if (!Array.isArray(result.favorites)) throw new Error("El servidor no confirmó la lectura de los favoritos.");
    return result.favorites as FavoriteDestination[];
  }
  return demoFavorites();
}

export async function toggleFavorite(destinationSlug: string, destinationName: string): Promise<FavoriteDestination[]> {
  if (shouldUseSupabase()) {
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
  localPersistenceAdapter.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export async function addExpense(
  tripId: string,
  expense: Omit<SavedExpense, "id" | "tripId" | "createdAt">,
): Promise<SavedExpense> {
  if (shouldUseSupabase()) {
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
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
  return result;
}

export async function updateExpense(
  tripId: string,
  expenseId: string,
  expense: Pick<SavedExpense, "category" | "description" | "amount" | "currency" | "incurredOn" | "notes" | "activityId">,
): Promise<void> {
  if (shouldUseSupabase()) {
    const result = await api<{ expense?: unknown }>(
      `/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`,
      { method: "PATCH", body: JSON.stringify(expense) },
    );
    if (!isRecord(result.expense) || result.expense.id !== expenseId || result.expense.tripId !== tripId) {
      throw new Error("El servidor no confirmó los cambios del gasto.");
    }
    return;
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  const existing = trip?.expenses.find((entry) => entry.id === expenseId);
  if (!trip || !existing) throw new Error("No se encontró el gasto.");
  Object.assign(existing, expense);
  trip.updatedAt = new Date().toISOString();
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function deleteExpense(tripId: string, expenseId: string): Promise<void> {
  if (shouldUseSupabase()) {
    const result = await api<{ deleted?: unknown }>(
      `/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`,
      { method: "DELETE" },
    );
    if (result.deleted !== true) throw new Error("El servidor no confirmó la eliminación del gasto.");
    return;
  }
  const trips = demoTrips();
  const trip = trips.find((entry) => entry.id === tripId);
  if (!trip || !trip.expenses.some((entry) => entry.id === expenseId)) throw new Error("No se encontró el gasto.");
  trip.expenses = trip.expenses.filter((entry) => entry.id !== expenseId);
  trip.updatedAt = new Date().toISOString();
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify(trips));
}

export async function listTripGroups(): Promise<SavedTripGroup[]> {
  if (shouldUseSupabase()) {
    const result = await api<{ groups?: unknown }>("/api/trip-groups");
    if (!Array.isArray(result.groups)) throw new Error("El servidor no confirmó la lectura de los viajes combinados.");
    return result.groups as SavedTripGroup[];
  }
  return readStored(TRIP_GROUPS_KEY, []);
}

export async function createTripGroup(
  name: string,
  items: SavedTripGroup["items"],
): Promise<SavedTripGroup> {
  if (shouldUseSupabase()) {
    const result = await api<{ group?: unknown }>("/api/trip-groups", {
      method: "POST",
      body: JSON.stringify({ name, items }),
    });
    if (!isRecord(result.group) || typeof result.group.id !== "string") {
      throw new Error("El servidor no confirmó la planificación combinada.");
    }
    return result.group as unknown as SavedTripGroup;
  }
  const trips = demoTrips();
  if (items.some((item) => !trips.some((trip) => trip.id === item.tripId))) {
    throw new Error("La planificación contiene un viaje que no está guardado localmente.");
  }
  const group: SavedTripGroup = {
    id: newId(),
    name: name.trim(),
    items: items.map((item, index) => ({ ...item, sortOrder: index + 1 })),
    createdAt: new Date().toISOString(),
  };
  localPersistenceAdapter.setItem(TRIP_GROUPS_KEY, JSON.stringify([group, ...await listTripGroups()]));
  return group;
}

export function persistenceLabel(): string {
  if (shouldUseSupabase()) return "Supabase";
  if (getPersistenceMode() === "demo") return "Demo local (este navegador)";
  return isVisitorLocalMode() ? "Dispositivo del visitante" : "Demo local (este navegador)";
}

export function saveTripToDevice(draft: TripDraft): SavedTrip {
  setVisitorLocalMode(true);
  const now = new Date().toISOString();
  const trip = normalizedDraft(normalizeNewTripDates(draft, localTodayIso()), newId(), now);
  localPersistenceAdapter.setItem(TRIPS_KEY, JSON.stringify([trip, ...demoTrips()]));
  return trip;
}

export function listDeviceTrips(): SavedTrip[] {
  return readStored(TRIPS_KEY, []);
}

export async function countDeviceTripsPendingImport(): Promise<number> {
  const scope = await getPlannerDraftScope();
  if (!scope.startsWith("user:") || getPersistenceMode() !== "supabase") return 0;
  const progressKey = `viajes.imported-device-trips.v1.${encodeURIComponent(scope.slice("user:".length))}`;
  const progress = readStored<Record<string, boolean>>(progressKey, {});
  return listDeviceTrips().filter((trip) => !progress[trip.id]).length;
}

export async function importDeviceTripsToAccount(): Promise<{ imported: number; total: number; skippedPast: number }> {
  const scope = await getPlannerDraftScope();
  if (!scope.startsWith("user:") || getPersistenceMode() !== "supabase") {
    throw new Error("Inicia sesión con una cuenta de Supabase antes de importar tus viajes.");
  }
  const trips = listDeviceTrips();
  const progressKey = `viajes.imported-device-trips.v1.${encodeURIComponent(scope.slice("user:".length))}`;
  const progress = readStored<Record<string, boolean>>(progressKey, {});
  const existingTrips = await listTrips();
  let imported = 0;
  let skippedPast = 0;
  for (const trip of trips) {
    if (progress[trip.id]) continue;
    if (trip.startDate && trip.startDate < localTodayIso()) {
      skippedPast += 1;
      continue;
    }
    const signature = importSignature(trip);
    if (existingTrips.some((existing) => importSignature(existing) === signature)) {
      progress[trip.id] = true;
      localPersistenceAdapter.setItem(progressKey, JSON.stringify(progress));
      continue;
    }
    await saveTrip({
      name: trip.name,
      origin: trip.origin,
      destination: trip.destination,
      ...(trip.startDate ? { startDate: trip.startDate } : {}),
      ...(trip.endDate ? { endDate: trip.endDate } : {}),
      travelers: trip.travelers,
      budget: trip.budget,
      currency: trip.currency,
      interests: trip.interests,
      travelType: trip.travelType,
      status: trip.status,
      itinerary: trip.itinerary,
    });
    progress[trip.id] = true;
    localPersistenceAdapter.setItem(progressKey, JSON.stringify(progress));
    existingTrips.push(trip);
    imported += 1;
  }
  return { imported, total: trips.length, skippedPast };
}

function importSignature(trip: SavedTrip): string {
  return JSON.stringify({
    name: trip.name,
    origin: trip.origin,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    budget: trip.budget,
    currency: trip.currency,
    itinerary: trip.itinerary.map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date ?? null,
      theme: day.theme,
      summary: day.summary,
      items: day.items.map((item) => ({
        name: item.name,
        description: item.description,
        startTime: item.startTime ?? null,
        endTime: item.endTime ?? null,
        durationMinutes: item.durationMinutes,
        estimate: item.estimate ?? null,
        currency: item.currency,
        order: item.order,
      })),
    })),
  });
}
