import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedTrip } from "@/lib/persistence/types";

const { listTripsMock, getPlannerDraftScopeMock, updateActivityMock, createActivityMock, deleteActivityMock, reorderActivitiesMock } = vi.hoisted(() => ({
  listTripsMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
  updateActivityMock: vi.fn(),
  createActivityMock: vi.fn(),
  deleteActivityMock: vi.fn(),
  reorderActivitiesMock: vi.fn(),
}));

vi.mock("@/lib/persistence/client", () => ({
  addExpense: vi.fn(),
  deleteExpense: vi.fn(),
  createActivity: createActivityMock,
  deleteActivity: deleteActivityMock,
  deleteTrip: vi.fn(),
  listTrips: listTripsMock,
  persistenceLabel: () => "local",
  reorderActivities: reorderActivitiesMock,
  replaceTripDay: vi.fn(),
  saveTrip: vi.fn(),
  updateActivity: updateActivityMock,
  updateExpense: vi.fn(),
  updateTrip: vi.fn(),
}));
vi.mock("@/lib/persistence/profile-client", () => ({
  getPlannerDraftScope: getPlannerDraftScopeMock,
}));
vi.mock("@/lib/hooks/use-local-today", () => ({ useLocalToday: () => "2026-10-20" }));

import { TripsManager } from "@/features/trips/components/trips-manager";

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

function makeTrip(id: string, name: string, destination: string, status: SavedTrip["status"], startDate: string, endDate: string): SavedTrip {
  return {
    id,
    name,
    origin: "Madrid",
    destination,
    startDate,
    endDate,
    travelers: 1,
    budget: 500,
    currency: "EUR",
    interests: [],
    travelType: "Cultural",
    status,
    itinerary: [],
    expenses: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("integración del calendario en Mis viajes", () => {
  it("abre el calendario desde la vista de viajes", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    listTripsMock.mockResolvedValue([]);
    render(<TripsManager view="trips" />);

    expect(screen.queryByRole("button", { name: "Duplicar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerar esta jornada" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Calendario" }));

    expect(await screen.findByRole("region", { name: "Calendario de viajes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calendario" })).toHaveAttribute("aria-pressed", "true");
  });

  it("aplica, quita y limpia filtros sin alterar la ordenación", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    listTripsMock.mockResolvedValue([
      makeTrip("lisbon", "Escapada Lisboa", "Lisboa", "planificado", "2026-11-10", "2026-11-13"),
      makeTrip("rome", "Fin de semana en Roma", "Roma", "borrador", "2027-03-02", "2027-03-05"),
      makeTrip("paris", "París en otoño", "París", "completado", "2026-09-01", "2026-09-04"),
    ]);
    const { container } = render(<TripsManager view="trips" />);

    const filterLayout = container.querySelector(".trip-manager > .grid");
    expect(filterLayout).toHaveClass("grid", "min-w-0", "gap-3");
    expect(filterLayout?.className).not.toContain("xl:grid-cols-[auto_minmax(0,1fr)]");

    expect(await screen.findByRole("heading", { name: "Escapada Lisboa" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fin de semana en Roma" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "París en otoño" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado" }), { target: { value: "drafts" } });
    expect(screen.getByRole("heading", { name: "Fin de semana en Roma" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Escapada Lisboa" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Quitar filtro de estado/ }));
    expect(screen.getByRole("heading", { name: "Escapada Lisboa" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar viaje" }), { target: { value: "Lisboa" } });
    expect(screen.getByRole("heading", { name: "Escapada Lisboa" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Fin de semana en Roma" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Limpiar filtros/ }));
    expect(screen.getByRole("heading", { name: "Fin de semana en Roma" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Más filtros/ }));
    fireEvent.change(screen.getByLabelText("Ordenar resultados"), { target: { value: "destination" } });
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    const tripHeadings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(tripHeadings).toEqual(["Escapada Lisboa", "París en otoño", "Fin de semana en Roma"]);
  });
});

describe("edición de horarios en viajes guardados", () => {
  it("sincroniza fin y duración y permite editar después de las 21:00", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("user:test");
    const trip = makeTrip("trip-1", "Viaje a Miami", "Miami", "planificado", "2026-11-10", "2026-11-10");
    trip.itinerary = [{
      id: "day-1", dayNumber: 1, date: "2026-11-10", theme: "Centro", summary: "", items: [{
        id: "activity-1", name: "Freedom Tower", description: "", blockType: "activity",
        startTime: "10:00", endTime: "11:30", durationMinutes: 90,
        currency: "EUR", order: 1, notes: "", source: "desconocido", priceStatus: "unknown",
      }],
    }];
    listTripsMock.mockResolvedValue([trip]);
    render(<TripsManager view="trips" />);

    fireEvent.click(await screen.findByText("Editar y ver detalles"));

    fireEvent.change(await screen.findByLabelText("Hora de finalización"), { target: { value: "12:00" } });
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue(120);
    fireEvent.change(screen.getByLabelText("Duración (minutos)"), { target: { value: "60" } });
    expect(screen.getByLabelText("Hora de finalización")).toHaveValue("11:00");
    fireEvent.change(screen.getByLabelText("Hora de inicio"), { target: { value: "22:00" } });
    expect(screen.getByLabelText("Hora de finalización")).toHaveValue("23:00");
    fireEvent.click(screen.getByRole("button", { name: "Guardar actividad" }));

    expect(updateActivityMock).toHaveBeenCalledWith("trip-1", expect.objectContaining({
      id: "activity-1", startTime: "22:00", durationMinutes: 60,
    }));
  });

  it("crea y persiste una actividad desde la cabecera de la jornada, también antes de las 07:00", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("user:test");
    const trip = makeTrip("trip-1", "Viaje a Miami", "Miami", "planificado", "2026-11-10", "2026-11-10");
    trip.itinerary = [{ id: "day-1", dayNumber: 1, date: "2026-11-10", theme: "Centro", summary: "", items: [] }];
    listTripsMock.mockResolvedValue([trip]);
    createActivityMock.mockResolvedValue({ orderUpdated: true });
    render(<TripsManager view="trips" />);

    fireEvent.click(await screen.findByRole("button", { name: "+ Añadir actividad" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Paseo al amanecer" } });
    fireEvent.change(screen.getByLabelText("Hora de inicio"), { target: { value: "06:00" } });
    expect(screen.getByLabelText("Hora de finalización")).toHaveValue("07:00");
    fireEvent.click(screen.getByRole("button", { name: "Guardar actividad" }));

    await waitFor(() => expect(createActivityMock).toHaveBeenCalledWith("trip-1", trip.itinerary[0], expect.objectContaining({
      name: "Paseo al amanecer", startTime: "06:00", endTime: "07:00", durationMinutes: 60,
    })));
    expect(await screen.findByText(/Actividad guardado correctamente/)).toBeInTheDocument();
  });

  it("permite editar y borrar un bloque de tiempo libre desde sus acciones secundarias", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("user:test");
    const trip = makeTrip("trip-1", "Viaje a Miami", "Miami", "planificado", "2026-11-10", "2026-11-10");
    trip.itinerary = [{ id: "day-1", dayNumber: 1, date: "2026-11-10", theme: "Centro", summary: "", items: [{
      id: "free-1", name: "Tiempo libre", description: "Pausa", blockType: "free_time", startTime: "12:00", endTime: "13:00", durationMinutes: 60,
      currency: "EUR", order: 1, notes: "", source: "desconocido", priceStatus: "unknown",
    }] }];
    listTripsMock.mockResolvedValue([trip]);
    updateActivityMock.mockResolvedValue(undefined);
    deleteActivityMock.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TripsManager view="trips" />);

    fireEvent.click(await screen.findByText("Editar y ver detalles"));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Tiempo libre");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Pausa editada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar actividad" }));
    await waitFor(() => expect(updateActivityMock).toHaveBeenCalledWith("trip-1", expect.objectContaining({ id: "free-1", name: "Pausa editada" })));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar actividad" }));
    expect(deleteActivityMock).toHaveBeenCalledWith("trip-1", "day-1", "free-1");
  });

  it("ofrece el mismo asistente contextual en viajes guardados y confirma la sustitución antes de persistir", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("user:test");
    const trip = makeTrip("trip-1", "Viaje a Miami", "Miami", "planificado", "2026-11-10", "2026-11-10");
    trip.itinerary = [{ id: "day-1", dayNumber: 1, date: "2026-11-10", theme: "Centro", summary: "", items: [{
      id: "activity-1", name: "Museo", description: "Arte", startTime: "10:00", endTime: "11:00", durationMinutes: 60,
      currency: "EUR", order: 1, blockType: "activity", source: "desconocido", priceStatus: "unknown", notes: "",
    }] }];
    listTripsMock.mockResolvedValue([trip]);
    updateActivityMock.mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      source: "openrouter", text: "Opción alternativa.", activityAlternatives: [{ name: "Museo cercano", description: "Colección similar", durationMinutes: 45, location: "Centro" }],
    }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<TripsManager view="trips" />);

    fireEvent.click(await screen.findByText("Editar y ver detalles"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar al asistente IA" }));
    fireEvent.change(screen.getByLabelText("Tu petición para el asistente"), { target: { value: "Busca algo similar" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Comparar alternativa" }));
    expect(updateActivityMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Proponer sustitución" }));
    await waitFor(() => expect(updateActivityMock).toHaveBeenCalledWith("trip-1", expect.objectContaining({
      id: "activity-1", name: "Museo cercano", durationMinutes: 45, startTime: "10:00", endTime: "10:45",
    })));
  });

  it("confirma el orden usando los IDs visuales de las actividades y muestra el estado persistido", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("user:test");
    const trip = makeTrip("trip-1", "Viaje a Miami", "Miami", "planificado", "2026-11-10", "2026-11-10");
    trip.itinerary = [{ id: "day-1", dayNumber: 1, date: "2026-11-10", theme: "Centro", summary: "", items: [
      { id: "one", name: "Torre", description: "", startTime: "10:00", endTime: "11:00", durationMinutes: 60, currency: "EUR", order: 1, notes: "", source: "desconocido", priceStatus: "unknown" },
      { id: "two", name: "Museo", description: "", startTime: "12:00", endTime: "13:00", durationMinutes: 60, currency: "EUR", order: 2, notes: "", source: "desconocido", priceStatus: "unknown" },
    ] }];
    listTripsMock.mockResolvedValue([trip]);
    reorderActivitiesMock.mockResolvedValue(undefined);
    render(<TripsManager view="trips" />);

    fireEvent.click(await screen.findByRole("button", { name: "Reorganizar día" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover Museo arriba" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y guardar orden" }));
    await waitFor(() => expect(reorderActivitiesMock).toHaveBeenCalledWith("trip-1", "day-1", ["two", "one"]));
  });
});
