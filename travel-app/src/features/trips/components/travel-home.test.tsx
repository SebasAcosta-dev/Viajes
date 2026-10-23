import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProfilePreferences } from "@/lib/types";
import type { SavedTripSummary } from "@/lib/persistence/types";
import { addIsoDays } from "@/lib/date-format";
import { localTodayIso } from "@/lib/trip-dates";

const { pushMock, getPlannerDraftScopeMock, getProfilePreferencesMock, listTripSummariesMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
  getProfilePreferencesMock: vi.fn(),
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
  listTripSummariesMock.mockReset();
});

describe("formulario del planificador", () => {
  it("mantiene una única estructura de formulario y envía el plan con intereses", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    getProfilePreferencesMock.mockResolvedValue(profile);
    listTripSummariesMock.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "demo",
      text: "Respuesta demo",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<TravelHome />);
    const submitButton = await screen.findByRole("button", { name: "Generar itinerario" });
    const notesField = screen.getByLabelText("Notas para personalizar el viaje") as HTMLTextAreaElement;
    expect(notesField).toHaveValue("");
    expect(notesField).toHaveAttribute("placeholder", "Ej.: Me interesa la historia local, probar la gastronomía típica y recorrer los barrios a pie.");
    expect(screen.queryByText("Previsualización del itinerario")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo de viaje")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ritmo")).not.toBeInTheDocument();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Crear viaje paso a paso" })).toHaveAttribute("href", "/planificar");
    expect(screen.getByRole("link", { name: "Abrir el asistente IA" })).toHaveAttribute("href", "/ia");
    expect(screen.getByRole("link", { name: "Explorar destinos" })).toHaveAttribute("href", "/destinos");
    expect(screen.queryByText("Destinos destacados")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mapa de actividades guardadas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir mapa interactivo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Accesos rápidos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Presupuesto de próximos viajes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preferencias del perfil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Favoritos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Viajes guardados" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir el último itinerario generado" })).not.toBeInTheDocument();
    const startDate = screen.getByLabelText("Fecha de salida") as HTMLInputElement;
    const endDate = screen.getByLabelText("Fecha de regreso") as HTMLInputElement;
    expect(startDate.min).toBe(localTodayIso());
    expect(startDate.value).toBe(localTodayIso());
    expect(endDate.min).toBe(localTodayIso());
    const movedStart = addIsoDays(localTodayIso(), 6) ?? localTodayIso();
    fireEvent.change(startDate, { target: { value: movedStart } });
    expect(endDate.value).toBe(movedStart);
    fireEvent.change(endDate, { target: { value: addIsoDays(movedStart, 4) ?? movedStart } });
    fireEvent.change(notesField, { target: { value: "Visitar el casco antiguo y probar platos locales." } });
    fireEvent.change(screen.getByLabelText("Añadir otro interés"), { target: { value: "Pádel" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    fireEvent.click(submitButton);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/itinerario"));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.context.origin).toBe("Madrid");
    expect(request.context.destination).toBe("Marrakech");
    expect(request.context.interests).toContain("Historia");
    expect(request.context.interests).toContain("Pádel");
    expect(request.context.startDate).toBe(movedStart);
    expect(request.context.endDate).toBe(addIsoDays(movedStart, 4));
    expect(request.context.travelers).toBeGreaterThan(0);
    expect(request.context.budget).toBeGreaterThan(0);
    expect(request.context.currency).toBe("EUR");
    expect(request.context.notes).toBe("Visitar el casco antiguo y probar platos locales.");
    expect(request.context).not.toHaveProperty("travelType");
    expect(request.context).not.toHaveProperty("pace");
    expect(request.message).toContain("Visitar el casco antiguo y probar platos locales.");
    expect(request.message).toContain("Pádel");
    expect(request.message).toContain("5 días");
  });

  it("envía COP como moneda seleccionada sin convertir el presupuesto", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    getProfilePreferencesMock.mockResolvedValue(profile);
    listTripSummariesMock.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: "demo", text: "Respuesta demo" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TravelHome />);
    const submitButton = await screen.findByRole("button", { name: "Generar itinerario" });
    const currency = screen.getByLabelText("Moneda");
    expect(screen.getByRole("option", { name: "COP — Peso colombiano" })).toBeInTheDocument();
    fireEvent.change(currency, { target: { value: "COP" } });
    fireEvent.click(submitButton);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/itinerario"));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.context.currency).toBe("COP");
    expect(request.context.budget).toBe(800);
  });

  it("resume hasta tres viajes próximos y enlaza con el listado completo", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    getProfilePreferencesMock.mockResolvedValue(profile);
    const trips: SavedTripSummary[] = Array.from({ length: 4 }, (_, index) => ({
      id: `trip-${index + 1}`,
      name: `Escapada ${index + 1}`,
      destination: `Destino ${index + 1}`,
      status: "planificado",
      startDate: `2027-0${index + 1}-10`,
      endDate: `2027-0${index + 1}-12`,
      budget: 400 + index * 100,
      currency: "EUR",
    }));
    listTripSummariesMock.mockResolvedValue(trips);

    render(<TravelHome />);

    expect(await screen.findByText(/Mostrando 3 de 4 próximos viajes/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Escapada 1/ })).toHaveAttribute("href", "/viajes#trip-trip-1");
    expect(screen.getByRole("link", { name: "Ver mis viajes" })).toHaveAttribute("href", "/viajes");
    expect(screen.queryByText("Destino 4")).not.toBeInTheDocument();
  });
});
