import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { listTripsMock, getPlannerDraftScopeMock } = vi.hoisted(() => ({
  listTripsMock: vi.fn(),
  getPlannerDraftScopeMock: vi.fn(),
}));

vi.mock("@/app/lib/persistence/client", () => ({
  addExpense: vi.fn(),
  deleteExpense: vi.fn(),
  deleteTrip: vi.fn(),
  listTrips: listTripsMock,
  persistenceLabel: () => "local",
  reorderActivities: vi.fn(),
  replaceTripDay: vi.fn(),
  saveTrip: vi.fn(),
  updateActivity: vi.fn(),
  updateExpense: vi.fn(),
  updateTrip: vi.fn(),
}));
vi.mock("@/app/lib/persistence/profile-client", () => ({
  getPlannerDraftScope: getPlannerDraftScopeMock,
}));
vi.mock("@/app/hooks/use-local-today", () => ({ useLocalToday: () => "2026-10-20" }));

import { TripsManager } from "@/app/components/trips-manager";

afterEach(() => vi.clearAllMocks());

describe("integración del calendario en Mis viajes", () => {
  it("abre el calendario desde la vista de viajes", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    listTripsMock.mockResolvedValue([]);
    render(<TripsManager view="trips" />);

    fireEvent.click(await screen.findByRole("button", { name: "Calendario" }));

    expect(await screen.findByRole("region", { name: "Calendario de viajes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calendario" })).toHaveAttribute("aria-pressed", "true");
  });
});
