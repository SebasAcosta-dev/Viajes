import { afterEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedSupabaseMock } = vi.hoisted(() => ({
  getAuthenticatedSupabaseMock: vi.fn(),
}));

vi.mock("@/app/lib/persistence/server", () => ({
  getAuthenticatedSupabase: getAuthenticatedSupabaseMock,
  persistenceErrorResponse: (error: unknown) => Response.json(
    { error: error instanceof Error ? error.message : "Persistence error" },
    { status: 500 },
  ),
}));

import { PATCH } from "@/app/api/trips/[tripId]/route";
import { dateInTimeZone } from "@/app/lib/trip-dates";
import { addIsoDays } from "@/app/lib/date-format";

const today = dateInTimeZone(new Date(), "UTC");

function setup(existing: { start_date: string | null; end_date: string | null } | null) {
  const tripQuery = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: existing ? {
        ...existing,
        trip_days: [{ day_number: 1 }],
        id: "trip-1",
        name: "Viaje",
        origin: "",
        destination: "Marrakech",
        travelers: 1,
        budget: 100,
        currency: "EUR",
        status: "borrador",
      } : null,
      error: null,
    }),
  };
  const rpc = vi.fn().mockResolvedValue({ data: "trip-1", error: null });
  const supabase = {
    from: vi.fn().mockReturnValue(tripQuery),
    rpc,
  };
  getAuthenticatedSupabaseMock.mockResolvedValue({ supabase, user: { id: "user-1" } });
  return { tripQuery, rpc };
}

function patch(body: unknown) {
  return new Request("http://localhost/api/trips/trip-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User-Time-Zone": "UTC" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/trips/[tripId]", () => {
  it("rechaza fechas pasadas cuando el usuario modifica el viaje", async () => {
    const yesterday = addIsoDays(today, -1) ?? today;
    const { tripQuery, rpc } = setup({ start_date: today, end_date: today });

    const response = await PATCH(patch({ startDate: yesterday }), { params: Promise.resolve({ tripId: "trip-1" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "La fecha de salida modificada no puede ser anterior al día actual.",
    });
    expect(tripQuery.eq).toHaveBeenNthCalledWith(1, "id", "trip-1");
    expect(tripQuery.eq).toHaveBeenNthCalledWith(2, "user_id", "user-1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserva fechas históricas si el usuario modifica solo otros campos", async () => {
    const historicalStart = "2020-01-01";
    const historicalEnd = "2020-01-01";
    const { tripQuery } = setup({ start_date: historicalStart, end_date: historicalEnd });

    const response = await PATCH(patch({ budget: 125 }), { params: Promise.resolve({ tripId: "trip-1" }) });

    expect(response.status).toBe(200);
    expect(tripQuery.update).toHaveBeenCalledWith({ budget: 125 });
    expect(tripQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("no permite modificar una fila de otro usuario", async () => {
    const { tripQuery, rpc } = setup(null);

    const response = await PATCH(patch({ startDate: today }), { params: Promise.resolve({ tripId: "trip-1" }) });

    expect(response.status).toBe(404);
    expect(tripQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(rpc).not.toHaveBeenCalled();
  });
});
