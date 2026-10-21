import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedSupabaseMock, persistenceErrorResponseMock } = vi.hoisted(() => ({
  getAuthenticatedSupabaseMock: vi.fn(),
  persistenceErrorResponseMock: vi.fn((error: unknown) =>
    Response.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 }),
  ),
}));

vi.mock("@/lib/persistence/server", () => ({
  getAuthenticatedSupabase: getAuthenticatedSupabaseMock,
  persistenceErrorResponse: persistenceErrorResponseMock,
}));

import { GET, PUT } from "@/app/(app)/api/profile/route";

const user = { id: "auth-user-1" };
const currentRow = {
  display_name: "Ana",
  currency: "EUR",
  language: "es",
  preferences: { interests: ["Historia"], legacy: "preserved" },
};
const updatedRow = {
  ...currentRow,
  currency: "USD",
  preferences: {
    interests: ["Fútbol"],
    pace: "equilibrado",
    budgetPreference: "",
    travelTypes: ["Cultural"],
    legacy: "preserved",
  },
};

function mockSupabase(rows: unknown[]) {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockImplementation(() => Promise.resolve({ data: rows.shift(), error: null }));
  const supabase = { from: vi.fn(() => query) };
  getAuthenticatedSupabaseMock.mockResolvedValue({ supabase, user });
  return { query, supabase };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("API de preferencias del perfil", () => {
  it("carga las preferencias mediante la sesión autenticada del usuario", async () => {
    const { query } = mockSupabase([currentRow]);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.preferences).toMatchObject({ interests: ["Historia"], currency: "EUR" });
    expect(query.eq).toHaveBeenCalledWith("id", user.id);
  });

  it("actualiza solo el perfil propio, preserva campos JSON existentes y devuelve lo guardado", async () => {
    const { query } = mockSupabase([currentRow, updatedRow]);
    const response = await PUT(new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ana",
        language: "es",
        currency: "USD",
        interests: ["Fútbol"],
        pace: "equilibrado",
        budgetPreference: "",
        travelTypes: ["Cultural"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      display_name: "Ana",
      currency: "USD",
      preferences: expect.objectContaining({ legacy: "preserved", interests: ["Fútbol"] }),
    }));
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", user.id);
    expect(query.eq).toHaveBeenNthCalledWith(2, "id", user.id);
    expect(body.preferences.interests).toEqual(["Fútbol"]);
  });

  it("recupera las preferencias persistidas en la siguiente lectura", async () => {
    const savedRow = {
      ...updatedRow,
      display_name: "Ana actualizada",
    };
    const { query } = mockSupabase([currentRow, savedRow, savedRow]);
    const writeResponse = await PUT(new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ana actualizada",
        language: "es",
        currency: "USD",
        interests: ["Fútbol"],
        pace: "equilibrado",
        budgetPreference: "",
        travelTypes: ["Cultural"],
      }),
    }));
    const readResponse = await GET();

    expect(writeResponse.status).toBe(200);
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toMatchObject({
      preferences: { name: "Ana actualizada", currency: "USD", interests: ["Fútbol"] },
    });
    expect(query.eq).toHaveBeenCalledWith("id", user.id);
  });

  it("rechaza preferencias inválidas sin escribir en Supabase", async () => {
    const { query } = mockSupabase([]);
    const response = await PUT(new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests: ["x".repeat(81)] }),
    }));

    expect(response.status).toBe(400);
    expect(query.update).not.toHaveBeenCalled();
  });
});
