import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationAutocomplete } from "@/features/trips/components/location-autocomplete";
import type { LocationSuggestion } from "@/lib/location-search";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LocationAutocomplete", () => {
  it("muestra sugerencias populares al enfocar el campo vacío", () => {
    render(<LocationAutocomplete label="Origen" value="" onChange={vi.fn()} onSelectionChange={vi.fn()} />);

    fireEvent.focus(screen.getByRole("combobox", { name: "Origen" }));

    expect(screen.getByRole("listbox", { name: "Sugerencias de Origen" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Barcelona.*España/ })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(8);
  });

  it("encuentra alias internacionales sin tildes y permite selección por teclado", () => {
    const selected = vi.fn();
    const changes: string[] = [];
    const onChange = (value: string) => changes.push(value);
    render(<LocationAutocomplete label="Destino" value="paris" onChange={onChange} onSelectionChange={selected} />);

    const input = screen.getByRole("combobox", { name: "Destino" });
    fireEvent.focus(input);
    expect(screen.getByRole("option", { name: /París.*Francia/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(changes).toEqual(["París"]);
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ name: "París", latitude: 48.8566 }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("permite seleccionar con ratón y cerrar con Escape", () => {
    const selected = vi.fn();
    const onChange = vi.fn();
    render(<LocationAutocomplete label="Origen" value="" onChange={onChange} onSelectionChange={selected} />);
    const input = screen.getByRole("combobox", { name: "Origen" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /Madrid.*España/ }));

    expect(onChange).toHaveBeenCalledWith("Madrid");
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ name: "Madrid" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("busca remotamente con debounce, combina resultados y conserva los metadatos", async () => {
    const remote: LocationSuggestion = {
      key: "san-sebastian-id", geographicId: "san-sebastian-id", name: "San Sebastián", country: "España",
      region: "País Vasco", latitude: 43.3183, longitude: -1.9812, source: "geoapify",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true, results: [remote] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const selected = vi.fn();
    const Wrapper = () => {
      const [value, setValue] = useState("");
      return <LocationAutocomplete label="Origen" value={value} onChange={setValue} onSelectionChange={selected} />;
    };
    render(<Wrapper />);
    const input = screen.getByRole("combobox", { name: "Origen" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "san se" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("option", { name: /San Sebastián.*País Vasco · España/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /San Sebastián.*País Vasco · España/ }));
    expect(selected).toHaveBeenCalledWith(remote);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/location-search?q=san%20se");
  });

  it("mantiene escritura libre y comunica que el proveedor no está disponible", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: false, results: [] }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    render(<LocationAutocomplete label="Destino" value="san" onChange={onChange} onSelectionChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Destino" });
    fireEvent.focus(input);
    expect(await screen.findByRole("status")).toHaveTextContent("No se pudieron cargar sugerencias en línea");
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "San Francisco" } });
    expect(onChange).toHaveBeenCalledWith("San Francisco");
  });

  it("distingue una búsqueda correcta sin resultados de un error del proveedor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true, results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    render(<LocationAutocomplete label="Destino" value="boyaca" onChange={vi.fn()} onSelectionChange={vi.fn()} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Destino" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No encontramos coincidencias"));
    expect(screen.queryByText(/No se pudieron cargar sugerencias/)).not.toBeInTheDocument();
  });

  it("mantiene el texto y la selección independientes entre origen y destino", () => {
    const Wrapper = () => {
      const [origin, setOrigin] = useState("");
      const [destination, setDestination] = useState("");
      return <>
        <LocationAutocomplete label="Origen" value={origin} onChange={setOrigin} onSelectionChange={vi.fn()} />
        <LocationAutocomplete label="Destino" value={destination} onChange={setDestination} onSelectionChange={vi.fn()} />
      </>;
    };
    render(<Wrapper />);
    fireEvent.change(screen.getByRole("combobox", { name: "Origen" }), { target: { value: "Madrid" } });

    expect(screen.getByRole("combobox", { name: "Origen" })).toHaveValue("Madrid");
    expect(screen.getByRole("combobox", { name: "Destino" })).toHaveValue("");
  });

  it("ignora una respuesta remota antigua que termina después de la búsqueda nueva", async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const Wrapper = () => {
      const [value, setValue] = useState("");
      return <LocationAutocomplete label="Destino" value={value} onChange={setValue} onSelectionChange={vi.fn()} />;
    };
    render(<Wrapper />);
    const input = screen.getByRole("combobox", { name: "Destino" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "larkspur-late" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.change(input, { target: { value: "novosibirsk" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => pending[1](new Response(JSON.stringify({ available: true, results: [{
      key: "san-se-id", name: "San Sebastián", country: "España", region: "País Vasco", source: "geoapify",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    expect(await screen.findByRole("option", { name: /San Sebastián.*País Vasco/ })).toBeInTheDocument();

    await act(async () => pending[0](new Response(JSON.stringify({ available: true, results: [{
      key: "larkspur-id", name: "Larkspur", country: "United States", source: "geoapify",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    expect(screen.queryByRole("option", { name: /Larkspur/ })).not.toBeInTheDocument();
  });
});
