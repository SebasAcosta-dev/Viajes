import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCalendar } from "@/features/calendar/components/trip-calendar";

describe("calendario de Mis viajes", () => {
  it("muestra un estado vacío y permite cambiar la vista del calendario", () => {
    render(<TripCalendar trips={[]} embedded />);

    expect(screen.getByText("Todavía no hay viajes guardados.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear viaje" })).toHaveAttribute("href", "/planificar");

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
  });

  it("no presenta un estado vacío cuando la carga falló", () => {
    render(<TripCalendar trips={[]} embedded hasError />);

    expect(screen.queryByText("Todavía no hay viajes guardados.")).not.toBeInTheDocument();
  });
});
