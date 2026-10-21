import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getPlannerDraftScopeMock, saveTripMock, saveTripToDeviceMock } = vi.hoisted(() => ({
  getPlannerDraftScopeMock: vi.fn(),
  saveTripMock: vi.fn(),
  saveTripToDeviceMock: vi.fn(),
}));

vi.mock("@/lib/persistence/profile-client", () => ({ getPlannerDraftScope: getPlannerDraftScopeMock }));
vi.mock("@/lib/persistence/client", () => ({
  persistenceLabel: () => "Dispositivo del visitante",
  saveTrip: saveTripMock,
  saveTripToDevice: saveTripToDeviceMock,
}));

import { SaveTripButton } from "@/features/trips/components/save-trip-button";

const draft = {
  name: "Viaje de prueba",
  destination: "Marrakech",
  budget: 100,
  currency: "EUR" as const,
  itinerary: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("guardar un viaje", () => {
  it("ofrece guardar localmente o iniciar el registro al visitante", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    getPlannerDraftScopeMock.mockResolvedValue("anonymous:device-1");
    render(<SaveTripButton draft={draft} />);

    fireEvent.click(screen.getByRole("button", { name: "Guardar viaje" }));
    expect(await screen.findByText(/Estás usando Viajes como visitante/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear una cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(saveTripMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Guardar en este dispositivo" }));
    await waitFor(() => expect(saveTripToDeviceMock).toHaveBeenCalledWith(draft));
    expect(await screen.findByRole("status")).toHaveTextContent("este dispositivo");
  });

  it("mantiene el guardado Supabase para una cuenta autenticada", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    getPlannerDraftScopeMock.mockResolvedValue("user:account-1");
    saveTripMock.mockResolvedValue({ id: "remote-1" });
    render(<SaveTripButton draft={draft} />);

    fireEvent.click(screen.getByRole("button", { name: "Guardar viaje" }));
    await waitFor(() => expect(saveTripMock).toHaveBeenCalledWith(draft));
    expect(screen.getByRole("status")).toHaveTextContent("Supabase");
    expect(saveTripToDeviceMock).not.toHaveBeenCalled();
  });
});
