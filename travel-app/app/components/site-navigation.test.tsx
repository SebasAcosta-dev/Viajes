import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteNavigation } from "@/app/components/site-navigation";

describe("navegación principal", () => {
  it("mantiene disponibles todos los destinos de navegación", () => {
    render(<SiteNavigation />);

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(navigation.querySelectorAll("a")).toHaveLength(10);
    expect(screen.getByRole("link", { name: "Explorar destinos" })).toHaveAttribute("href", "/destinos");
    expect(screen.getByRole("link", { name: "Asistente IA" })).toHaveAttribute("href", "/ia");
  });

  it("expone el estado del menú adaptable y lo cierra al navegar", () => {
    render(<SiteNavigation />);

    const toggle = screen.getByRole("button", { name: "Menú" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");

    const destinationLink = screen.getByRole("link", { name: "Explorar destinos" });
    destinationLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(destinationLink);
    expect(screen.getByRole("button", { name: "Menú" })).toHaveAttribute("aria-expanded", "false");
  });
});
