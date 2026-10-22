import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GeneratedItineraryDraft } from "@/lib/generated-itinerary";

const { loadGeneratedItineraryMock, getPlannerDraftScopeMock, saveGeneratedItineraryMock } = vi.hoisted(() => ({
  loadGeneratedItineraryMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
  saveGeneratedItineraryMock: vi.fn(),
}));

vi.mock("@/lib/generated-itinerary", () => ({
  loadGeneratedItinerary: loadGeneratedItineraryMock,
  saveGeneratedItinerary: saveGeneratedItineraryMock,
}));
vi.mock("@/lib/persistence/profile-client", () => ({ getPlannerDraftScope: getPlannerDraftScopeMock }));
vi.mock("@/features/trips/components/save-trip-button", () => ({ SaveTripButton: () => <button type="button">Guardar viaje</button> }));

import ItineraryPage from "@/app/(app)/itinerario/page";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function fixture(items: GeneratedItineraryDraft["itinerary"]["days"][number]["items"]): GeneratedItineraryDraft {
  return {
    form: { origin: "Madrid", destination: "Roma", startDate: "2026-10-22", endDate: "2026-10-22", travelers: 1, budget: 100, currency: "EUR", interests: ["Historia"], travelType: "Cultural", pace: "equilibrado", notes: "" },
    itinerary: { destination: "Roma", durationDays: 1, budget: { total: 100, currency: "EUR", status: "provided" }, days: [{ id: "day-1", dayNumber: 1, date: "2026-10-22", theme: "Centro", summary: "", items }] },
    source: "openrouter", generatedAt: "2026-10-22T00:00:00Z",
  };
}

const activity = (id: string, name: string, startTime: string, endTime: string, durationMinutes: number) => ({
  id, name, description: "Detalle de prueba", blockType: "activity" as const,
  startTime, endTime, durationMinutes, currency: "EUR" as const, order: 1,
  notes: "", source: "desconocido" as const,
});

describe("edición del itinerario", () => {
  it("muestra los horarios existentes y sincroniza inicio, fin y duración al editar", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    loadGeneratedItineraryMock.mockReturnValue(fixture([activity("visit-1", "Freedom Tower", "10:00", "11:30", 90)]));
    render(<ItineraryPage />);

    expect(await screen.findByText("10:00–11:30")).toBeInTheDocument();
    expect(screen.getByText("Elige las horas de cada actividad")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar actividad" }));
    fireEvent.change(screen.getByLabelText("Hora de finalización"), { target: { value: "12:00" } });
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue(120);
    fireEvent.change(screen.getByLabelText("Duración (minutos)"), { target: { value: "60" } });
    expect(screen.getByLabelText("Hora de finalización")).toHaveValue("11:00");
    fireEvent.click(screen.getByRole("button", { name: "Guardar actividad" }));

    await waitFor(() => expect(saveGeneratedItineraryMock.mock.calls.at(-1)?.[0].itinerary.days[0].items[0]).toMatchObject({ endTime: "11:00", durationMinutes: 60 }));
  });

  it("permite insertar entre actividades, revisar la reorganización y confirmar antes de guardar", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    loadGeneratedItineraryMock.mockReturnValue(fixture([
      { ...activity("breakfast", "Desayuno", "09:00", "09:45", 45), blockType: "breakfast" },
      activity("basilica", "Basílica", "10:00", "11:15", 75),
      { ...activity("lunch", "Almuerzo", "13:00", "14:00", 60), blockType: "lunch" },
      { ...activity("dinner", "Cena", "19:00", "20:00", 60), blockType: "dinner" },
    ]));
    render(<ItineraryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Añadir actividad" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Paseo por el centro" } });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Hora de finalización"), { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar actividad" }));

    expect(saveGeneratedItineraryMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Mantener los demás horarios" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/solapamientos/);
    fireEvent.click(await screen.findByRole("button", { name: "Proponer reorganización" }));
    expect(screen.getAllByText("Basílica").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y guardar en borrador" }));

    await waitFor(() => expect(saveGeneratedItineraryMock).toHaveBeenCalledOnce());
    expect(saveGeneratedItineraryMock.mock.calls.at(-1)?.[0].itinerary.days[0].items.map((item: { name: string; startTime?: string; endTime?: string }) => [item.name, item.startTime, item.endTime])).toEqual([
      ["Desayuno", "09:00", "09:45"],
      ["Paseo por el centro", "10:00", "10:30"],
      ["Basílica", "10:30", "11:45"],
      ["Almuerzo", "13:30", "14:30"],
      ["Cena", "19:30", "20:30"],
    ]);
  });

  it("permite crear una actividad temprana y otra después de las 21:00", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    loadGeneratedItineraryMock.mockReturnValue(fixture([activity("visit-1", "Visita", "10:00", "11:00", 60)]));
    render(<ItineraryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Añadir actividad" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Desayuno" } });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), { target: { value: "07:30" } });
    fireEvent.change(screen.getByLabelText("Hora de finalización"), { target: { value: "08:15" } });
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue(45);
    fireEvent.click(screen.getByRole("button", { name: "Guardar actividad" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mantener los demás horarios" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y guardar en borrador" }));
    expect(saveGeneratedItineraryMock.mock.calls.at(-1)?.[0].itinerary.days[0].items.find((item: { name: string }) => item.name === "Desayuno"))
      .toMatchObject({ name: "Desayuno", startTime: "07:30", endTime: "08:15" });
  });

  it("reordena con los controles accesibles y permite una consulta contextual real a la API existente", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    loadGeneratedItineraryMock.mockReturnValue(fixture([
      activity("one", "Freedom Tower", "10:00", "11:30", 90),
      activity("two", "Museo", "12:00", "13:00", 60),
    ]));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      source: "openrouter", text: "Alternativas propuestas.",
      activityAlternatives: [{ name: "Museo cercano", description: "Una opción de arquitectura.", durationMinutes: 60, location: "Centro" }],
    }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ItineraryPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Reorganizar día" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mover Museo arriba" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mantener los demás horarios" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y guardar en borrador" }));
    expect(saveGeneratedItineraryMock.mock.calls.at(-1)?.[0].itinerary.days[0].items.map((item: { name: string }) => item.name)).toEqual(["Museo", "Freedom Tower"]);

    fireEvent.click(screen.getAllByRole("button", { name: "Consultar al asistente IA" })[0]);
    fireEvent.change(screen.getByLabelText("Tu petición para el asistente"), { target: { value: "Sugiere una alternativa" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Museo cercano")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"activity":{"name":"Museo"'),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Comparar alternativa" }));
    fireEvent.click(screen.getByRole("button", { name: "Proponer sustitución" }));
    expect(screen.getByText(/Sustituir por/)).toBeInTheDocument();
  });

  it("elimina del borrador solo la actividad confirmada y persiste el resultado", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    loadGeneratedItineraryMock.mockReturnValue(fixture([
      activity("one", "Freedom Tower", "10:00", "11:30", 90),
      activity("two", "Museo", "12:00", "13:00", 60),
    ]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ItineraryPage />);

    const firstActivity = await screen.findByText("Freedom Tower");
    const activityCard = firstActivity.closest("li");
    const actionSummary = activityCard?.querySelectorAll("summary").item(1);
    expect(actionSummary).not.toBeNull();
    fireEvent.click(actionSummary!);
    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar actividad" })[0]);
    await waitFor(() => expect(saveGeneratedItineraryMock.mock.calls.at(-1)?.[0].itinerary.days[0].items.map((item: { name: string }) => item.name)).toEqual(["Museo"]));
  });
});
