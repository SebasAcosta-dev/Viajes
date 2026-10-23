import { afterEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedSupabaseMock } = vi.hoisted(() => ({
  getAuthenticatedSupabaseMock: vi.fn(),
}));

vi.mock("@/lib/persistence/server", () => ({
  getAuthenticatedSupabase: getAuthenticatedSupabaseMock,
  persistenceErrorResponse: (error: unknown) => {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    return Response.json(
      { error: error instanceof Error ? error.message : "Persistence error" },
      { status: code === "42501" ? 403 : 500 },
    );
  },
}));

import { GET, POST } from "@/app/(app)/api/trips/route";
import { addIsoDays } from "@/lib/date-format";
import { dateInTimeZone } from "@/lib/trip-dates";

const testToday = dateInTimeZone(new Date(), "UTC");
const testStartDate = addIsoDays(testToday, 1) ?? testToday;
const draft = {
  name: "Viaje a Marrakech",
  origin: "Madrid",
  destination: "Marrakech",
  startDate: testStartDate,
  endDate: testStartDate,
  travelers: 1,
  budget: 100,
  currency: "EUR",
  interests: [],
  travelType: "Económico",
  itinerary: [{
    id: "day-1",
    dayNumber: 1,
    date: testStartDate,
    theme: "Medina",
    summary: "",
    items: [{
      id: "visit-1",
      name: "Visita",
      description: "Visita orientativa.",
      blockType: "activity",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      estimate: 12,
      pricePerPerson: 12,
      priceStatus: "estimate",
      interestTags: [],
      budgetCategory: "activity",
      currency: "EUR",
      order: 1,
      notes: "",
      source: "orientativo",
      reliability: "unknown",
    }],
  }],
};

function setup(
  schemaError?: { code?: string; message: string },
  rpcError?: { code?: string; message: string },
  readBackStartTime = "10:00:00",
  readBackDate = testStartDate,
) {
  const schemaQuery = {
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ error: schemaError ?? null }),
  };
  const savedTrip = {
    id: "trip-1",
    name: "Viaje a Marrakech",
    origin: "Madrid",
    destination: "Marrakech",
    start_date: readBackDate,
    end_date: readBackDate,
    travelers: 1,
    budget: 10000,
    currency: "EUR",
    interests: [],
    travel_type: "Económico",
    status: "borrador",
    trip_days: [{
      id: "day-row-1",
      day_number: 1,
      date: readBackDate,
      theme: "Medina",
      summary: "",
      activities: [{
        id: "activity-row-1",
        name: "Visita",
        description: "Visita orientativa.",
        block_type: "activity",
        start_time: readBackStartTime,
        end_time: "11:00:00",
        duration_minutes: 60,
        estimate: 1200,
        price_per_person: 1200,
        price_status: "estimate",
        interest_tags: [],
        budget_category: "activity",
        currency: "EUR",
        sort_order: 1,
        notes: "",
        source: "orientativo",
        data_reliability: "unknown",
      }],
    }],
    expenses: [],
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
  };
  const tripQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: savedTrip, error: null }),
  };
  const supabase = {
    from: vi.fn().mockReturnValueOnce(schemaQuery).mockReturnValueOnce(tripQuery),
    rpc: vi.fn().mockResolvedValue({ data: "trip-1", error: rpcError ?? null }),
  };
  getAuthenticatedSupabaseMock.mockResolvedValue({ supabase, user: { id: "user-1" } });
  return { schemaQuery, tripQuery, supabase };
}

function request(payload: unknown = draft) {
  return new Request("http://localhost/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Time-Zone": "UTC" },
    body: JSON.stringify(payload),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/trips", () => {
  it("persiste los campos horarios y solo responde éxito tras leer el viaje guardado", async () => {
    const { schemaQuery, supabase, tripQuery } = setup();
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.trip.id).toBe("trip-1");
    expect(schemaQuery.select).toHaveBeenCalledWith(
      "price_per_person,price_status,price_source,price_checked_at,interest_tags,budget_category,block_type,location_label,travel_minutes,data_reliability",
    );
    expect(supabase.rpc).toHaveBeenCalledWith("create_trip_with_itinerary", {
      trip_payload: expect.objectContaining({
        itinerary: [expect.objectContaining({
          items: [expect.objectContaining({
            startTime: "10:00",
            endTime: "11:00",
            blockType: "activity",
            estimate: 1200,
            pricePerPerson: 1200,
            priceStatus: "estimate",
          })],
        })],
      }),
    });
    expect(tripQuery.eq).toHaveBeenNthCalledWith(1, "id", "trip-1");
    expect(tripQuery.eq).toHaveBeenNthCalledWith(2, "user_id", "user-1");
  });

  it("corrige a hoy las fechas de un viaje nuevo con salida pasada sin perder jornadas", async () => {
    const yesterday = addIsoDays(testToday, -1) ?? testToday;
    const historicalDraft = {
      ...draft,
      startDate: yesterday,
      endDate: yesterday,
      itinerary: [{ ...draft.itinerary[0], date: yesterday }],
    };
    const { supabase } = setup(undefined, undefined, "10:00:00", testToday);

    const response = await POST(request(historicalDraft));

    expect(response.status).toBe(201);
    expect(supabase.rpc).toHaveBeenCalledWith("create_trip_with_itinerary", {
      trip_payload: expect.objectContaining({
        startDate: testToday,
        endDate: testToday,
        itinerary: [expect.objectContaining({ date: testToday })],
      }),
    });
  });

  it.each([
    ["PGRST204", "column activities.price_status does not exist", "20261020000200_itinerary_activity_metadata.sql"],
    ["42703", "column activities.block_type does not exist", "20261020000300_itinerary_schedule.sql"],
  ])("identifica columnas ausentes de la migración %s", async (code, message, migration) => {
    setup({ code, message });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error).toContain(migration);
  });

  it("no presenta otros errores de esquema como migraciones pendientes", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = setup({ code: "42501", message: "permission denied for table activities" });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).not.toContain("Aplica");
    expect(logger).toHaveBeenCalledWith("Trip metadata schema check failed", {
      code: "42501",
      message: "permission denied for table activities",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledTimes(1);
  });

  it("no confirma el guardado si la función RPC no está disponible", async () => {
    setup(undefined, { code: "PGRST202", message: "Could not find function create_trip_with_itinerary" });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error).toContain("20261020000200_itinerary_activity_metadata.sql");
  });

  it("no responde éxito si la lectura posterior no conserva las horas enviadas", async () => {
    setup(undefined, undefined, "10:30:00");
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error).toContain("no confirmó todos los días");
  });
});

describe("GET /api/trips", () => {
  it("devuelve un resumen mínimo para Inicio sin leer itinerarios ni gastos", async () => {
    const rows = [{
      id: "trip-1",
      name: "Marrakech",
      destination: "Marrakech",
      status: "planificado",
      start_date: "2026-10-20",
      end_date: "2026-10-23",
      budget: 10000,
      currency: "EUR",
    }];
    const summaryQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(summaryQuery) };
    getAuthenticatedSupabaseMock.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const response = await GET(new Request("http://localhost/api/trips?summary=1"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trips: [{
        id: "trip-1",
        name: "Marrakech",
        destination: "Marrakech",
        status: "planificado",
        startDate: "2026-10-20",
        endDate: "2026-10-23",
        budget: 100,
        currency: "EUR",
      }],
    });
    expect(summaryQuery.select).toHaveBeenCalledWith("id,name,destination,status,start_date,end_date,budget,currency");
    expect(summaryQuery.limit).toHaveBeenCalledWith(50);
    expect(summaryQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.from).toHaveBeenCalledWith("trips");
  });

  it("recupera únicamente viajes pertenecientes al usuario autenticado", async () => {
    const tripQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(tripQuery) };
    getAuthenticatedSupabaseMock.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const response = await GET(new Request("http://localhost/api/trips"));

    expect(response.status).toBe(200);
    expect(tripQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("permite volver a cargar el viaje creado desde la lista autenticada", async () => {
    const savedRow = {
      id: "trip-1",
      name: "Viaje a Marrakech",
      origin: "Madrid",
      destination: "Marrakech",
      start_date: testStartDate,
      end_date: testStartDate,
      travelers: 1,
      budget: 10000,
      currency: "EUR",
      interests: [],
      travel_type: "Económico",
      status: "borrador",
      trip_days: [],
      expenses: [],
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    };
    const tripQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [savedRow], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(tripQuery) };
    getAuthenticatedSupabaseMock.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const response = await GET(new Request("http://localhost/api/trips"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      trips: [{
        id: "trip-1",
        startDate: testStartDate,
        endDate: testStartDate,
        itinerary: [],
        expenses: [],
      }],
    });
    expect(tripQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
