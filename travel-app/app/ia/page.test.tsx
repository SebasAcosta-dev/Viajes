import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/components/save-trip-button", () => ({
  SaveTripButton: () => <button type="button">Guardar viaje</button>,
}));

import IaPage from "@/app/ia/page";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("asistente de viajes", () => {
  it("envía fechas y presupuesto, y presenta el periodo y horario estructurado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "openrouter",
      text: "Itinerario listo.",
      itinerary: {
        destination: "Marrakech",
        durationDays: 4,
        startDate: "2026-10-20",
        endDate: "2026-10-23",
        travelers: 1,
        budget: { total: 100, currency: "EUR", status: "provided" },
        days: [{
          id: "day-1",
          dayNumber: 1,
          date: "2026-10-20",
          theme: "Medina",
          summary: "",
          items: [{
            id: "visit-1",
            name: "Visita",
            description: "Plan orientativo.",
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
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<IaPage />);
    fireEvent.change(screen.getByLabelText("Salida"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Regreso"), { target: { value: "2026-10-23" } });
    fireEvent.change(screen.getByLabelText("Viajeros"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Presupuesto"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.context).toMatchObject({
      startDate: "2026-10-20",
      endDate: "2026-10-23",
      travelers: 1,
      budget: 100,
      currency: "EUR",
    });
    expect(await screen.findByText(/20 de octubre de 2026 – 23 de octubre de 2026/)).toBeTruthy();
    expect(screen.getByText("10:00–11:00")).toBeTruthy();
    expect(screen.getAllByText(/09:00–21:00/).length).toBeGreaterThan(0);
  });
});
