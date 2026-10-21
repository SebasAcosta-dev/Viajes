import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProfilePreferences } from "@/lib/types";
import { addIsoDays } from "@/lib/date-format";
import { localTodayIso } from "@/lib/trip-dates";

const { pushMock, getPlannerDraftScopeMock, getProfilePreferencesMock, listFavoritesMock, listTripSummariesMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
  getProfilePreferencesMock: vi.fn(),
  listFavoritesMock: vi.fn(),
  listTripSummariesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/lib/persistence/profile-client", () => ({
  getPlannerDraftScope: getPlannerDraftScopeMock,
  getProfilePreferences: getProfilePreferencesMock,
}));
vi.mock("@/lib/persistence/client", () => ({
  listFavorites: listFavoritesMock,
  listTripSummaries: listTripSummariesMock,
  persistenceLabel: () => "demo",
  toggleFavorite: vi.fn(),
}));

import { TravelHome } from "@/features/trips/components/travel-home";

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
  listTripSummariesMock.mockReset();
});

describe("formulario del planificador", () => {
  it("mantiene una única estructura de formulario y envía el plan con intereses", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    getProfilePreferencesMock.mockResolvedValue(profile);
    listFavoritesMock.mockResolvedValue([]);
    listTripSummariesMock.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "demo",
      text: "Respuesta demo",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<TravelHome />);
    const submitButton = await screen.findByRole("button", { name: "Generar itinerario" });
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Crear viaje paso a paso" })).toHaveAttribute("href", "/planificar");
    expect(screen.getByRole("link", { name: "Abrir el asistente IA" })).toHaveAttribute("href", "/ia");
    expect(screen.getByRole("link", { name: "Explorar destinos" })).toHaveAttribute("href", "/destinos");
    const startDate = screen.getByLabelText("Fecha de salida") as HTMLInputElement;
    const endDate = screen.getByLabelText("Fecha de regreso") as HTMLInputElement;
    expect(startDate.min).toBe(localTodayIso());
    expect(startDate.value).toBe(localTodayIso());
    expect(endDate.min).toBe(localTodayIso());
    const movedStart = addIsoDays(localTodayIso(), 6) ?? localTodayIso();
    fireEvent.change(startDate, { target: { value: movedStart } });
    expect(endDate.value).toBe(movedStart);
    fireEvent.change(endDate, { target: { value: addIsoDays(movedStart, 4) ?? movedStart } });
    fireEvent.click(submitButton);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/itinerario"));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.context.interests).toContain("Historia");
    expect(request.context.startDate).toBe(movedStart);
    expect(request.context.endDate).toBe(addIsoDays(movedStart, 4));
    expect(request.context.travelers).toBeGreaterThan(0);
    expect(request.context.budget).toBeGreaterThan(0);
    expect(request.context.currency).toBe("EUR");
    expect(request.message).toContain("5 días");
  });
});
