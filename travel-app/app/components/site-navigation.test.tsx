import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteNavigation } from "@/app/components/site-navigation";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/") }));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

describe("navegación principal", () => {
  it("muestra solo las cinco secciones principales y las rutas secundarias se agrupan", () => {
    render(<SiteNavigation />);

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(navigation.querySelectorAll("a")).toHaveLength(5);
    expect([...navigation.querySelectorAll("a")].map((link) => link.textContent)).toEqual([
      "Inicio", "Mis viajes", "Mapa", "Presupuesto", "Cuenta",
    ]);
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Calendario" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Asistente IA" })).not.toBeInTheDocument();
  });

  it("resalta Mis viajes en las rutas secundarias del proceso de planificación", () => {
    usePathnameMock.mockReturnValue("/ia");
    render(<SiteNavigation />);

    expect(screen.getByRole("link", { name: "Mis viajes" })).toHaveAttribute("aria-current", "page");
  });

  it("expone el estado del menú adaptable y lo cierra al navegar", () => {
    render(<SiteNavigation />);

    const toggle = screen.getByRole("button", { name: "Menú" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");

    const destinationLink = screen.getByRole("link", { name: "Mis viajes" });
    destinationLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(destinationLink);
    expect(screen.getByRole("button", { name: "Menú" })).toHaveAttribute("aria-expanded", "false");
  });
});
