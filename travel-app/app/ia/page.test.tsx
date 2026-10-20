import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { addIsoDays } from "@/app/lib/date-format";
import { localTodayIso } from "@/app/lib/trip-dates";

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
    const startDate = localTodayIso();
    const endDate = addIsoDays(startDate, 3) ?? startDate;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "openrouter",
      text: "Itinerario listo.",
      itinerary: {
        destination: "Marrakech",
        durationDays: 4,
        startDate,
        endDate,
        travelers: 1,
        budget: { total: 100, currency: "EUR", status: "provided" },
        days: [{
          id: "day-1",
          dayNumber: 1,
          date: startDate,
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
    const departure = screen.getByLabelText("Salida") as HTMLInputElement;
    const returnDate = screen.getByLabelText("Regreso") as HTMLInputElement;
    expect(departure.min).toBe(startDate);
    fireEvent.change(departure, { target: { value: startDate } });
    fireEvent.change(returnDate, { target: { value: endDate } });
    fireEvent.change(screen.getByLabelText("Viajeros"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Presupuesto"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.context).toMatchObject({
      startDate,
      endDate,
      travelers: 1,
      budget: 100,
      currency: "EUR",
    });
    expect(await screen.findByText(new RegExp(`${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${startDate}T12:00:00Z`))} – ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${endDate}T12:00:00Z`))}`))).toBeTruthy();
    expect(screen.getByText("10:00–11:00")).toBeTruthy();
    expect(screen.getAllByText(/09:00–21:00/).length).toBeGreaterThan(0);
  });
});
