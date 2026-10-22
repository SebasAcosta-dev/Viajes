import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedSupabaseMock, deleteTripActivityMock, updateTripActivityMock, persistenceErrorResponseMock } = vi.hoisted(() => ({
  getAuthenticatedSupabaseMock: vi.fn(),
  deleteTripActivityMock: vi.fn(),
  updateTripActivityMock: vi.fn(),
  persistenceErrorResponseMock: vi.fn((error: unknown) => Response.json({ error: String(error) }, { status: 500 })),
}));

vi.mock("@/lib/persistence/server", () => ({
  getAuthenticatedSupabase: getAuthenticatedSupabaseMock,
  persistenceErrorResponse: persistenceErrorResponseMock,
}));
vi.mock("@/features/itinerary/services/activities-api", () => ({
  deleteTripActivity: deleteTripActivityMock,
  updateTripActivity: updateTripActivityMock,
}));

import { DELETE } from "@/app/(app)/api/trips/[tripId]/activities/[activityId]/route";

describe("DELETE /api/trips/[tripId]/activities/[activityId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedSupabaseMock.mockResolvedValue({ supabase: {}, user: { id: "owner-1" } });
  });

  it("borra solo mediante el servicio autenticado y confirma éxito", async () => {
    deleteTripActivityMock.mockResolvedValue(true);
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ tripId: "trip-1", activityId: "activity-1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(deleteTripActivityMock).toHaveBeenCalledWith({}, "owner-1", "trip-1", "activity-1");
  });

  it("no confirma la eliminación si no se encontró una actividad propia", async () => {
    deleteTripActivityMock.mockResolvedValue(false);
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ tripId: "trip-1", activityId: "foreign-activity" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toHaveProperty("error");
  });
});
