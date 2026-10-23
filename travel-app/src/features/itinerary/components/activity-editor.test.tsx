import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ItineraryItem } from "@/lib/types";
import { ActivityEditor, getActivityCategoryClasses } from "@/features/itinerary/components/activity-editor";

const activity: ItineraryItem = {
  id: "activity-1", name: "Tiempo libre", description: "Descanso", blockType: "free_time",
  startTime: "10:00", endTime: "11:00", durationMinutes: 60, currency: "EUR", order: 1,
  notes: "", source: "desconocido", priceStatus: "unknown",
};

describe("editor compartido de actividades", () => {
  it("valida y guarda todos los tipos de bloque mediante el mismo formulario", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<ActivityEditor activity={activity} travelers={2} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar actividad" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Pausa" } });
    fireEvent.change(screen.getByLabelText("Tipo de bloque"), { target: { value: "rest" } });
    fireEvent.change(screen.getByLabelText("Hora de finalización"), { target: { value: "11:30" } });
    expect(screen.getByLabelText("Duración (minutos)")).toHaveValue(90);
    fireEvent.click(screen.getByRole("button", { name: "Guardar actividad" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Pausa", blockType: "rest", startTime: "10:00", endTime: "11:30", durationMinutes: 90,
    })));
  });

  it("usa una categoría visual común y neutra cuando faltan datos", () => {
    expect(getActivityCategoryClasses(activity)).toContain("violet");
    expect(getActivityCategoryClasses({ ...activity, blockType: undefined })).toContain("white");
  });
});
