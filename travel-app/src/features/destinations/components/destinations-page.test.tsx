import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { destinations } from "@/lib/data/demo-data";

const { getPlannerDraftScopeMock, listFavoritesMock, toggleFavoriteMock } = vi.hoisted(() => ({
  getPlannerDraftScopeMock: vi.fn(),
  listFavoritesMock: vi.fn(),
  toggleFavoriteMock: vi.fn(),
}));

vi.mock("@/lib/persistence/profile-client", () => ({ getPlannerDraftScope: getPlannerDraftScopeMock }));
vi.mock("@/lib/persistence/client", () => ({
  listFavorites: listFavoritesMock,
  persistenceLabel: () => "demo",
  toggleFavorite: toggleFavoriteMock,
}));

import DestinationsPage from "@/features/destinations/components/destinations-page";

afterEach(() => vi.clearAllMocks());

describe("página de destinos", () => {
  it("conserva la acción para guardar y quitar destinos favoritos", async () => {
    getPlannerDraftScopeMock.mockResolvedValue("anonymous");
    listFavoritesMock.mockResolvedValue([]);
    const destination = destinations[0];
    const savedFavorite = {
      id: "favorite-1",
      destinationSlug: destination.slug,
      destinationName: destination.name,
      createdAt: "2026-10-21T00:00:00.000Z",
    };
    toggleFavoriteMock.mockResolvedValue([savedFavorite]);

    render(<DestinationsPage />);
    const saveButton = await screen.findAllByRole("button", { name: "Guardar" }).then((buttons) => buttons[0]);
    fireEvent.click(saveButton);

    await waitFor(() => expect(toggleFavoriteMock).toHaveBeenCalledWith(destination.slug, destination.name));
    expect(await screen.findByRole("button", { name: "Guardado" })).toHaveAttribute("aria-pressed", "true");
  });
});
