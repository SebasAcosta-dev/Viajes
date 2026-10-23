import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGeneratedItinerary } from "@/lib/generated-itinerary";
import type { ProfilePreferences } from "@/lib/types";
import { addIsoDays } from "@/lib/date-format";
import { localTodayIso } from "@/lib/trip-dates";

const { pushMock, getProfilePreferencesMock, getPlannerDraftScopeMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getProfilePreferencesMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/persistence/profile-client", () => ({
  getProfilePreferences: getProfilePreferencesMock,
  getPlannerDraftScope: getPlannerDraftScopeMock,
}));

import { ManualTripPlanner } from "@/features/itinerary/components/manual-trip-planner";

const preferences: ProfilePreferences = {
  name: "Ana",
  language: "es",
  currency: "EUR",
  interests: ["Historia"],
  pace: "equilibrado",
  budgetPreference: "",
  travelTypes: ["Cultural"],
};

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  pushMock.mockReset();
  getProfilePreferencesMock.mockReset();
  getPlannerDraftScopeMock.mockReset();
});

describe("planificación manual", () => {
  it("prepara una propuesta local con fechas e intereses y permite revisar antes de guardar", async () => {
    getProfilePreferencesMock.mockResolvedValue(preferences);
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    render(<ManualTripPlanner />);
    expect(screen.queryByLabelText("Tipo de viaje")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ritmo")).not.toBeInTheDocument();

    const startDate = addIsoDays(localTodayIso(), 2) ?? localTodayIso();
    const endDate = addIsoDays(startDate, 2) ?? startDate;
    fireEvent.change(screen.getByRole("combobox", { name: "Origen" }), { target: { value: "Madrid" } });
    const departure = screen.getByLabelText("Fecha de salida") as HTMLInputElement;
    const returnDate = screen.getByLabelText("Fecha de regreso") as HTMLInputElement;
    expect(departure.min).toBe(localTodayIso());
    fireEvent.change(departure, { target: { value: startDate } });
    fireEvent.change(returnDate, { target: { value: endDate } });
    const laterDeparture = addIsoDays(endDate, 2) ?? endDate;
    fireEvent.change(departure, { target: { value: laterDeparture } });
    expect(returnDate.value).toBe(laterDeparture);
    fireEvent.change(returnDate, { target: { value: addIsoDays(laterDeparture, 2) ?? laterDeparture } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar con preferencias" }));
    await screen.findByText("Preferencias cargadas para Ana.");
    fireEvent.change(screen.getByLabelText("Presupuesto para actividades"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Preparar itinerario para revisar" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/itinerario"));
    const draft = loadGeneratedItinerary("anonymous");
    expect(draft?.source).toBe("demo");
    expect(draft?.form).toMatchObject({
      startDate: laterDeparture,
      endDate: addIsoDays(laterDeparture, 2),
      interests: ["Historia"],
      budget: 100,
    });
    expect(draft?.itinerary.days).toHaveLength(3);
  });
});
