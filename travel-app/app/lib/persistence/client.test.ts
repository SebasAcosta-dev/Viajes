import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addExpense,
  createTripGroup,
  deleteExpense,
  deleteTrip,
  listFavorites,
  listTrips,
  listTripSummaries,
  listTripGroups,
  reorderActivities,
  replaceTripDay,
  saveTrip,
  toggleFavorite,
  updateActivity,
  updateExpense,
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
    await updateExpense(trip.id, afterExpense!.expenses[0].id, {
      category: "Gastronomía",
      description: "Comida editada",
      amount: 25,
      currency: "USD",
      incurredOn: "2026-10-19",
      notes: "Con amigos",
    });
    expect((await listTrips()).find((entry) => entry.id === trip.id)?.expenses[0]).toMatchObject({
      description: "Comida editada",
      amount: 25,
      notes: "Con amigos",
    });

    await deleteExpense(trip.id, afterExpense!.expenses[0].id);
    expect((await listTrips()).find((entry) => entry.id === trip.id)?.expenses).toHaveLength(0);

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

  it("devuelve solo campos de resumen para un máximo de cincuenta viajes locales", async () => {
    await saveTrip(draft);
    await saveTrip({ ...draft, name: "Segundo destino", destination: "Fez" });
    await saveTrip({ ...draft, name: "Tercer destino", destination: "Rabat" });
    await saveTrip({ ...draft, name: "Cuarto destino", destination: "Tánger" });
    const summaries = await listTripSummaries();
    expect(summaries).toHaveLength(5);
    expect(summaries[0]).toMatchObject({ name: "Cuarto destino", destination: "Tánger" });
    expect(Object.keys(summaries[0]).sort()).toEqual([
      "budget", "currency", "destination", "endDate", "id", "name", "startDate", "status",
    ]);
  });

  it("crea un grupo de viajes locales sin fusionar los originales", async () => {
    const first = await saveTrip(draft);
    const second = await saveTrip({ ...draft, name: "Segundo destino", destination: "Fez" });
    const originalTrips = await listTrips();
    const group = await createTripGroup("Ruta", [
      { tripId: first.id, sortOrder: 1, startDate: first.startDate, endDate: first.endDate },
      { tripId: second.id, sortOrder: 2, startDate: second.startDate, endDate: second.endDate },
    ]);
    expect(await listTripGroups()).toContainEqual(group);
    expect(await listTrips()).toEqual(originalTrips);
  });

  it("solo sustituye una jornada y conserva las demás; reordena elementos de forma local", async () => {
    const twoDayDraft = {
      ...draft,
      endDate: "2026-10-20",
      itinerary: [
        { ...draft.itinerary[0], items: [...draft.itinerary[0].items] },
        { ...draft.itinerary[0], id: "day-2", dayNumber: 2, date: "2026-10-20", theme: "Día dos", items: [...draft.itinerary[0].items] },
      ],
    };
    twoDayDraft.itinerary[0].items.push({
      ...twoDayDraft.itinerary[0].items[0],
      id: "activity-2",
      name: "Segundo paseo",
      order: 2,
    });
    const trip = await saveTrip(twoDayDraft);
    await reorderActivities(trip.id, "day-1", ["activity-2", "activity-1"]);
    const newDay = {
      ...trip.itinerary[1],
      theme: "Jornada nueva",
      items: [{ ...trip.itinerary[1].items[0], name: "Visita nueva" }],
    };
    await replaceTripDay(trip.id, 2, newDay);
    const saved = (await listTrips()).find((entry) => entry.id === trip.id);
    expect(saved?.itinerary[0].items.map((activity) => activity.name)).toEqual(["Segundo paseo", "Paseo"]);
    expect(saved?.itinerary[1]).toMatchObject({ theme: "Jornada nueva", items: [{ name: "Visita nueva" }] });
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

  it("solicita al servidor únicamente el resumen ligero de viajes", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      trips: [{ id: "trip-1", name: "Marrakech", destination: "Marrakech", status: "planificado" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listTripSummaries()).resolves.toEqual([
      { id: "trip-1", name: "Marrakech", destination: "Marrakech", status: "planificado" },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/trips?summary=1");
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
