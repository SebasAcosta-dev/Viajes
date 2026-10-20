import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGeneratedItinerary } from "@/app/lib/generated-itinerary";
import type { ProfilePreferences } from "@/app/lib/types";

const { pushMock, getProfilePreferencesMock, getPlannerDraftScopeMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getProfilePreferencesMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/app/lib/persistence/profile-client", () => ({
  getProfilePreferences: getProfilePreferencesMock,
  getPlannerDraftScope: getPlannerDraftScopeMock,
}));

import { ManualTripPlanner } from "@/app/components/manual-trip-planner";

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

    fireEvent.change(screen.getByRole("textbox", { name: "Origen" }), { target: { value: "Madrid" } });
    fireEvent.change(screen.getByLabelText("Fecha de salida"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Fecha de regreso"), { target: { value: "2026-10-22" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar con preferencias" }));
    await screen.findByText("Preferencias cargadas para Ana.");
    fireEvent.change(screen.getByLabelText("Presupuesto para actividades"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Preparar itinerario para revisar" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/itinerario"));
    const draft = loadGeneratedItinerary("anonymous");
    expect(draft?.source).toBe("demo");
    expect(draft?.form).toMatchObject({
      startDate: "2026-10-20",
      endDate: "2026-10-22",
      interests: ["Historia"],
      budget: 100,
    });
    expect(draft?.itinerary.days).toHaveLength(3);
  });
});
