import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InterestPicker } from "@/features/itinerary/components/interest-picker";

describe("InterestPicker", () => {
  it("permite seleccionar varios intereses y buscar dentro del catálogo", () => {
    const onSelectedChange = vi.fn();
    render(
      <InterestPicker
        selected={[]}
        customInterests={[]}
        onSelectedChange={onSelectedChange}
        onCustomInterestsChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar intereses" }), { target: { value: "fútbol" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Fútbol" }));
    expect(onSelectedChange).toHaveBeenCalledWith(["Fútbol"]);
  });

  it("presenta las categorías en una columna móvil y dos columnas desde escritorio", () => {
    const { container } = render(
      <InterestPicker
        selected={[]}
        customInterests={[]}
        onSelectedChange={vi.fn()}
        onCustomInterestsChange={vi.fn()}
      />,
    );

    const categoryGrid = container.querySelector(".grid.grid-cols-1");
    expect(categoryGrid).toHaveClass("md:grid-cols-2");
    expect(categoryGrid).not.toHaveClass("max-h-[28rem]", "overflow-y-auto");
    expect(container.querySelectorAll("details").length).toBeGreaterThan(1);
  });

  it("retira los intereses antiguos del catálogo pero permite añadirlos como personalizados", () => {
    const onCustomInterestsChange = vi.fn();
    const { rerender } = render(
      <InterestPicker
        selected={[]}
        customInterests={[]}
        onSelectedChange={vi.fn()}
        onCustomInterestsChange={onCustomInterestsChange}
      />,
    );

    expect(screen.queryByText("Gastronomía")).not.toBeInTheDocument();
    expect(screen.queryByText("Transporte histórico")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Gastronomía local" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Tranvías históricos" })).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText("Escribe un interés personalizado");
    fireEvent.change(input, { target: { value: "Gastronomía local" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(onCustomInterestsChange).toHaveBeenLastCalledWith(["Gastronomía local"]);
    rerender(
      <InterestPicker
        selected={[]}
        customInterests={["Gastronomía local"]}
        onSelectedChange={vi.fn()}
        onCustomInterestsChange={onCustomInterestsChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Escribe un interés personalizado"), { target: { value: "Tranvías históricos" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(onCustomInterestsChange).toHaveBeenLastCalledWith(["Gastronomía local", "Tranvías históricos"]);
  });

  it("permite deseleccionar una categoría seleccionada", () => {
    const onSelectedChange = vi.fn();
    const { rerender } = render(
      <InterestPicker
        selected={[]}
        customInterests={[]}
        onSelectedChange={onSelectedChange}
        onCustomInterestsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Fútbol" }));
    expect(onSelectedChange).toHaveBeenLastCalledWith(["Fútbol"]);
    rerender(
      <InterestPicker
        selected={["Fútbol"]}
        customInterests={[]}
        onSelectedChange={onSelectedChange}
        onCustomInterestsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Fútbol" }));
    expect(onSelectedChange).toHaveBeenLastCalledWith([]);
  });

  it("permite limpiar selecciones", () => {
    const onSelectedChange = vi.fn();
    const onCustomInterestsChange = vi.fn();
    render(
      <InterestPicker
        selected={["Historia"]}
        customInterests={["Pádel"]}
        onSelectedChange={onSelectedChange}
        onCustomInterestsChange={onCustomInterestsChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpiar selecciones" }));
    expect(onSelectedChange).toHaveBeenCalledWith([]);
    expect(onCustomInterestsChange).toHaveBeenCalledWith([]);
  });

  it("no crea formularios anidados y permite añadir intereses con el teclado", () => {
    const onCustomInterestsChange = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <InterestPicker
          selected={[]}
          customInterests={[]}
          onSelectedChange={vi.fn()}
          onCustomInterestsChange={onCustomInterestsChange}
        />
      </form>,
    );

    expect(container.querySelectorAll("form")).toHaveLength(1);
    const customInput = screen.getByPlaceholderText("Escribe un interés personalizado");
    fireEvent.change(customInput, { target: { value: "Fotografía nocturna" } });
    fireEvent.keyDown(customInput, { key: "Enter" });
    expect(onCustomInterestsChange).toHaveBeenCalledWith(["Fotografía nocturna"]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("añade un interés personalizado con el botón", () => {
    const onCustomInterestsChange = vi.fn();
    render(
      <InterestPicker
        selected={[]}
        customInterests={[]}
        onSelectedChange={vi.fn()}
        onCustomInterestsChange={onCustomInterestsChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Escribe un interés personalizado"), { target: { value: "Fotografía" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(onCustomInterestsChange).toHaveBeenCalledWith(["Fotografía"]);
  });

  it("hidrata el selector dentro del formulario padre sin diferencias de estructura", async () => {
    const onSelectedChange = vi.fn();
    const onCustomInterestsChange = vi.fn();
    const tree = (
      <form>
        <InterestPicker
          selected={[]}
          customInterests={[]}
          onSelectedChange={onSelectedChange}
          onCustomInterestsChange={onCustomInterestsChange}
        />
      </form>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, tree);
      });
      expect(container.querySelectorAll("form")).toHaveLength(1);
      expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match/i);
    } finally {
      if (root) await act(async () => root?.unmount());
      if (previousActEnvironment === undefined) {
        delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
      } else {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      }
      consoleError.mockRestore();
    }
  });
});
