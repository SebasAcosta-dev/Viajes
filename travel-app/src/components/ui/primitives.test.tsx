import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeading } from "@/components/ui";

describe("componentes compartidos", () => {
  it("expone variantes y respeta los estados deshabilitado y de carga", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button variant="outline" size="lg" onClick={onClick}>Continuar</Button>);
    const button = screen.getByRole("button", { name: "Continuar" });
    expect(button).toHaveClass("ui-button--outline", "ui-button--lg");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<Button loading>Guardando</Button>);
    expect(screen.getByRole("button", { name: "Guardando" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardando" })).toHaveAttribute("aria-busy", "true");
  });

  it("mantiene la semántica de tarjetas y badges", () => {
    render(
      <Card>
        <CardHeader><CardTitle>Próximo viaje</CardTitle><CardDescription>Tu siguiente plan</CardDescription></CardHeader>
        <CardContent><Badge variant="success">Confirmado</Badge></CardContent>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Próximo viaje" })).toBeInTheDocument();
    expect(screen.getByText("Tu siguiente plan")).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toHaveClass("ui-badge--success");
  });

  it("asocia label, ayuda y error con su campo", () => {
    render(
      <Field id="destination" label="Destino" hint="Ciudad o país" error="El destino es obligatorio.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Destino")).toHaveAttribute("aria-describedby", "destination-hint destination-error");
    expect(screen.getByLabelText("Destino")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("El destino es obligatorio.");
  });

  it("mantiene un encabezado único y consistente para la página", () => {
    render(<PageHeading eyebrow="Viajes" title="Mis viajes" description="Todos tus planes." />);
    expect(screen.getByRole("heading", { level: 1, name: "Mis viajes" })).toBeInTheDocument();
    expect(screen.getByText("Viajes")).toBeInTheDocument();
    expect(screen.getByText("Todos tus planes.")).toBeInTheDocument();
  });
});
