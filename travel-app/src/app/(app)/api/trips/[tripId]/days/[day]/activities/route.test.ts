import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedSupabaseMock, createTripActivityMock, persistenceErrorResponseMock } = vi.hoisted(() => ({
  getAuthenticatedSupabaseMock: vi.fn(),
  createTripActivityMock: vi.fn(),
  persistenceErrorResponseMock: vi.fn((error: unknown) => Response.json({ error: String(error) }, { status: 500 })),
}));

vi.mock("@/lib/persistence/server", () => ({
  getAuthenticatedSupabase: getAuthenticatedSupabaseMock,
  persistenceErrorResponse: persistenceErrorResponseMock,
}));
vi.mock("@/features/itinerary/services/activities-api", () => ({ createTripActivity: createTripActivityMock }));

import { POST } from "@/app/(app)/api/trips/[tripId]/days/[day]/activities/route";

const context = { params: Promise.resolve({ tripId: "trip-1", day: "day-1" }) };
const validPayload = {
  name: "Paseo temprano", description: "", startTime: "06:00", endTime: "06:45",
  durationMinutes: 45, blockType: "free_time",
};

describe("POST /api/trips/[tripId]/days/[day]/activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedSupabaseMock.mockResolvedValue({ supabase: {}, user: { id: "user-1" } });
  });

  it("crea una actividad y confirma el orden en el día del propietario", async () => {
    createTripActivityMock.mockResolvedValue({ kind: "created", id: "activity-1", orderUpdated: true });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(validPayload) }), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: true, activityId: "activity-1", orderUpdated: true });
    expect(createTripActivityMock).toHaveBeenCalledWith({}, "user-1", "trip-1", "day-1", expect.objectContaining({ startTime: "06:00" }));
  });

  it("comunica que se creó el elemento cuando falló la reorganización posterior", async () => {
    createTripActivityMock.mockResolvedValue({ kind: "created", id: "activity-1", orderUpdated: false, orderErrorCode: "PGRST202" });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(validPayload) }), context);
    expect(response.status).toBe(207);
    expect(await response.json()).toMatchObject({ created: true, orderUpdated: false, orderErrorCode: "PGRST202" });
  });

  it("rechaza horas que no coinciden con la duración antes de llamar al servicio", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...validPayload, durationMinutes: 30 }) }), context);
    expect(response.status).toBe(400);
    expect(createTripActivityMock).not.toHaveBeenCalled();
  });
});
