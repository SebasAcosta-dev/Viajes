import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProfilePreferences } from "@/app/lib/types";

const { pushMock, getPlannerDraftScopeMock, getProfilePreferencesMock, listFavoritesMock, listTripsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
  getProfilePreferencesMock: vi.fn(),
  listFavoritesMock: vi.fn(),
  listTripsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/app/lib/persistence/profile-client", () => ({
  getPlannerDraftScope: getPlannerDraftScopeMock,
  getProfilePreferences: getProfilePreferencesMock,
}));
vi.mock("@/app/lib/persistence/client", () => ({
  listFavorites: listFavoritesMock,
  listTrips: listTripsMock,
  persistenceLabel: () => "demo",
  toggleFavorite: vi.fn(),
}));

import { TravelHome } from "@/app/components/travel-home";

const profile: ProfilePreferences = {
  name: "",
  language: "es",
  currency: "EUR",
  interests: ["Historia"],
  pace: "equilibrado",
  budgetPreference: "",
  travelTypes: [],
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pushMock.mockReset();
  getPlannerDraftScopeMock.mockReset();
  getProfilePreferencesMock.mockReset();
  listFavoritesMock.mockReset();
  listTripsMock.mockReset();
});

describe("formulario del planificador", () => {
  it("mantiene una única estructura de formulario y envía el plan con intereses", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    getProfilePreferencesMock.mockResolvedValue(profile);
    listFavoritesMock.mockResolvedValue([]);
    listTripsMock.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "demo",
      text: "Respuesta demo",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<TravelHome />);
    const submitButton = await screen.findByRole("button", { name: "Generar itinerario" });
    expect(container.querySelectorAll("form")).toHaveLength(1);
    fireEvent.click(submitButton);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/itinerario"));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.context.interests).toContain("Historia");
    expect(request.context.startDate).toBe("2026-04-12");
    expect(request.context.endDate).toBe("2026-04-16");
    expect(request.context.travelers).toBeGreaterThan(0);
    expect(request.context.budget).toBeGreaterThan(0);
    expect(request.context.currency).toBe("EUR");
    expect(request.message).toContain("5 días");
  });
});
