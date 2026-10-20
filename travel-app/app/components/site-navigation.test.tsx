import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteNavigation } from "@/app/components/site-navigation";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/") }));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

describe("navegación principal", () => {
  it("muestra los accesos públicos y agrupa las rutas del proceso de planificación", () => {
    render(<SiteNavigation />);

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(navigation.querySelectorAll("a")).toHaveLength(8);
    expect([...navigation.querySelectorAll("a")].map((link) => link.textContent)).toEqual([
      "Inicio", "Destinos", "Planificar", "Asistente", "Mis viajes", "Mapa", "Presupuesto", "Cuenta",
    ]);
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Destinos" })).toHaveAttribute("href", "/destinos");
    expect(screen.getByRole("link", { name: "Planificar" })).toHaveAttribute("href", "/planificar");
  });

  it("resalta Mis viajes en las rutas secundarias del proceso de planificación", () => {
    usePathnameMock.mockReturnValue("/ia");
    render(<SiteNavigation />);

    expect(screen.getByRole("link", { name: "Planificar" })).toHaveAttribute("aria-current", "page");
  });

  it("expone el estado del menú adaptable y lo cierra al navegar", () => {
    render(<SiteNavigation />);

    const toggle = screen.getByRole("button", { name: "Menú" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");

    const destinationLink = screen.getByRole("link", { name: "Destinos" });
    destinationLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(destinationLink);
    expect(screen.getByRole("button", { name: "Menú" })).toHaveAttribute("aria-expanded", "false");
  });
});
