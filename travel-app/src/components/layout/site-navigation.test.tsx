import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SiteNavigation } from "@/components/layout/site-navigation";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/") }));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

beforeEach(() => usePathnameMock.mockReturnValue("/"));
afterEach(() => vi.clearAllMocks());

describe("navegación principal", () => {
  it("muestra solo las cinco opciones principales y no duplica destinos secundarios", () => {
    render(<SiteNavigation />);

    const navigation = screen.getByRole("navigation");
    const links = [...navigation.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual([
      "Inicio", "Mis viajes", "Mapa", "Presupuesto", "Cuenta",
    ]);
    expect(links.map((link) => (link as HTMLAnchorElement).getAttribute("href"))).toEqual([
      "/", "/viajes", "/mapa", "/presupuesto", "/cuenta",
    ]);
    expect(new Set(links.map((link) => (link as HTMLAnchorElement).href)).size).toBe(5);
    for (const label of ["Destinos", "Planificar", "Asistente", "Favoritos", "Perfil"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/destinos", "Inicio"],
    ["/planificar", "Mis viajes"],
    ["/ia", "Mis viajes"],
    ["/itinerario", "Mis viajes"],
    ["/viajes", "Mis viajes"],
    ["/calendario", "Mis viajes"],
    ["/favoritos", "Cuenta"],
    ["/perfil", "Cuenta"],
  ])("marca la sección principal correspondiente a %s", (pathname, label) => {
    usePathnameMock.mockReturnValue(pathname);
    render(<SiteNavigation />);

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  });

  it("usa menú adaptable en móvil y una fila sin ajuste en escritorio", () => {
    render(<SiteNavigation />);

    const navigation = screen.getByRole("navigation");
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveClass("lg:hidden");
    expect(navigation).toHaveClass("grid-cols-2", "sm:grid-cols-3", "lg:flex-nowrap", "hidden");
    expect(navigation.parentElement).toHaveClass("lg:flex-nowrap");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(navigation).toHaveClass("grid");
    const mapLink = screen.getByRole("link", { name: "Mapa" });
    mapLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(mapLink);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
