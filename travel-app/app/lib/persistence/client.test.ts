import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addExpense,
  deleteTrip,
  listFavorites,
  listTrips,
  saveTrip,
  toggleFavorite,
  updateActivity,
  updateTrip,
} from "@/app/lib/persistence/client";
import type { TripDraft } from "@/app/lib/persistence/types";

const draft: TripDraft = {
  name: "Prueba en Marrakech",
  destination: "Marrakech",
  startDate: "2026-10-19",
  endDate: "2026-10-19",
  travelers: 3,
  budget: 250,
  currency: "EUR",
  itinerary: [{
    id: "day-1",
    dayNumber: 1,
    theme: "Medina",
    summary: "",
    items: [{
      id: "activity-1",
      name: "Paseo",
      description: "Ruta orientativa.",
      durationMinutes: 60,
      estimate: 0,
      currency: "EUR",
      order: 1,
      notes: "Orientativo",
      source: "orientativo",
    }],
  }],
};

describe("persistencia en modo demo", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "demo");
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("crea un viaje persistente, actualiza presupuesto/actividad, registra gastos y elimina el viaje", async () => {
    const trip = await saveTrip(draft);
    expect((await listTrips()).find((entry) => entry.id === trip.id)).toMatchObject({
      startDate: "2026-10-19",
      endDate: "2026-10-19",
      travelers: 3,
    });

    await updateTrip(trip.id, { budget: 400, currency: "USD" });
    const updated = (await listTrips()).find((entry) => entry.id === trip.id);
    expect(updated).toMatchObject({ budget: 400, currency: "USD" });

    const activity = { ...trip.itinerary[0].items[0], name: "Paseo editado", durationMinutes: 90 };
    await updateActivity(trip.id, activity);
    const afterActivity = (await listTrips()).find((entry) => entry.id === trip.id);
    expect(afterActivity?.itinerary[0].items[0]).toMatchObject({ name: "Paseo editado", durationMinutes: 90 });

    await addExpense(trip.id, {
      category: "Comida",
      description: "Almuerzo",
      amount: 20,
      currency: "USD",
      incurredOn: "2026-10-19",
    });
    const afterExpense = (await listTrips()).find((entry) => entry.id === trip.id);
    expect(afterExpense?.expenses).toHaveLength(1);
    expect(afterExpense?.expenses[0].amount).toBe(20);

    await deleteTrip(trip.id);
    expect((await listTrips()).some((entry) => entry.id === trip.id)).toBe(false);
  });

  it("alterna destinos favoritos y conserva el cambio en el almacenamiento local", async () => {
    const added = await toggleFavorite("marrakech", "Marrakech");
    expect(added.some((favorite) => favorite.destinationSlug === "marrakech")).toBe(true);
    expect((await listFavorites()).some((favorite) => favorite.destinationSlug === "marrakech")).toBe(true);

    const removed = await toggleFavorite("marrakech", "Marrakech");
    expect(removed.some((favorite) => favorite.destinationSlug === "marrakech")).toBe(false);
  });

  it("no finge modo demo ante un modo mal configurado", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabse");
    await expect(listTrips()).rejects.toThrow("NEXT_PUBLIC_DATA_MODE");
  });
});

describe("persistencia Supabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("no confirma un guardado cuando la API Supabase falla", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Inicia sesión." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(saveTrip(draft)).rejects.toThrow("Inicia sesión.");
  });

  it("no interpreta una respuesta malformada de la API como un guardado exitoso", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));

    await expect(saveTrip(draft)).rejects.toThrow("no se confirmó la operación");
  });

  it("solo confirma cambios de presupuesto cuando el servidor devuelve los valores persistidos", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      trip: { id: "trip-1", budget: 400, currency: "USD", status: "planificado" },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateTrip("trip-1", { budget: 400, currency: "USD" })).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/trips/trip-1");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ budget: 400, currency: "USD" });
  });

  it("rechaza una respuesta 2xx que no confirma los valores guardados", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      trip: { id: "trip-1", budget: 200, currency: "EUR" },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(updateTrip("trip-1", { budget: 400 })).rejects.toThrow("no confirmó los cambios");
  });
});
