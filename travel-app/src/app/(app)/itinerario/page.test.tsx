import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { loadGeneratedItineraryMock, getPlannerDraftScopeMock } = vi.hoisted(() => ({
  loadGeneratedItineraryMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
}));

vi.mock("@/lib/generated-itinerary", () => ({
  loadGeneratedItinerary: loadGeneratedItineraryMock,
  saveGeneratedItinerary: vi.fn(),
}));
vi.mock("@/lib/persistence/profile-client", () => ({
  getPlannerDraftScope: getPlannerDraftScopeMock,
}));
vi.mock("@/features/trips/components/save-trip-button", () => ({
  SaveTripButton: () => <button type="button">Guardar viaje</button>,
}));

import ItineraryPage from "@/app/(app)/itinerario/page";

afterEach(() => {
  vi.clearAllMocks();
});

describe("presentación del itinerario", () => {
  it("muestra el periodo, el rango general y las horas de los bloques también al editar", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    loadGeneratedItineraryMock.mockReturnValue({
      form: {
        origin: "Madrid",
        destination: "Marrakech",
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        travelers: 1,
        budget: 100,
        currency: "EUR",
        interests: [],
        travelType: "Económico",
        pace: "equilibrado",
        notes: "",
      },
      itinerary: {
        destination: "Marrakech",
        durationDays: 1,
        budget: { total: 100, currency: "EUR", status: "provided" },
        days: [{
          id: "day-1",
          dayNumber: 1,
          date: "2026-10-20",
          theme: "Medina",
          summary: "",
          items: [{
            id: "visit-1",
            name: "Visita a la Medina",
            description: "Visita orientativa.",
            blockType: "activity",
            startTime: "10:00",
            endTime: "11:00",
            durationMinutes: 60,
            priceStatus: "unknown",
            currency: "EUR",
            order: 1,
            notes: "",
            source: "orientativo",
          }],
        }],
      },
      source: "openrouter",
      generatedAt: "2026-10-20T00:00:00Z",
    });

    render(<ItineraryPage />);

    expect(await screen.findByText("Salida: 20 de octubre de 2026 · Regreso: 20 de octubre de 2026")).toBeTruthy();
    expect(screen.getAllByText(/09:00–21:00/).length).toBeGreaterThan(0);
    expect(screen.getByText("10:00–11:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Editar actividad" }));
    expect(screen.getByText((_, element) => element?.textContent === "Horario del bloque: 10:00–11:00")).toBeTruthy();
  });
});
