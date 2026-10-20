import { TripFormValues } from "@/app/lib/types";
import { localTodayIso } from "@/app/lib/trip-dates";

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateTripForm(values: TripFormValues): string[] {
  const errors: string[] = [];

  if (!values.origin.trim()) errors.push("El origen es obligatorio.");
  if (!values.destination.trim()) errors.push("El destino es obligatorio.");
  if (!values.startDate) errors.push("La fecha de salida es obligatoria.");
  if (!values.endDate) errors.push("La fecha de regreso es obligatoria.");
  if (values.startDate && !isValidDate(values.startDate)) errors.push("La fecha de salida no es válida.");
  if (values.endDate && !isValidDate(values.endDate)) errors.push("La fecha de regreso no es válida.");
  if (values.startDate && isValidDate(values.startDate) && values.startDate < localTodayIso()) {
    errors.push("La fecha de salida no puede ser anterior al día actual.");
  }
  if (values.startDate && values.endDate && values.startDate > values.endDate) {
    errors.push("La fecha de regreso no puede ser anterior a la de salida.");
  }
  if (values.startDate && values.endDate && isValidDate(values.startDate) && isValidDate(values.endDate) &&
    (Date.parse(`${values.endDate}T00:00:00Z`) - Date.parse(`${values.startDate}T00:00:00Z`)) / 86_400_000 >= 30) {
    errors.push("El viaje no puede superar los 30 días.");
  }
  if (!Number.isInteger(values.travelers) || values.travelers < 1 || values.travelers > 100) {
    errors.push("El número de viajeros debe ser un entero entre 1 y 100.");
  }
  if (!Number.isFinite(values.budget) || values.budget <= 0) errors.push("El presupuesto debe ser mayor que cero.");
  if (!values.interests.length) errors.push("Selecciona al menos un interés.");

  return errors;
}

export function calculateBudgetBreakdown(budget: number): {
  transportation: number;
  accommodation: number;
  meals: number;
  tickets: number;
  activities: number;
  localTransport: number;
  other: number;
} {
  const total = Math.max(budget, 0);
  return {
    transportation: Number((total * 0.2).toFixed(2)),
    accommodation: Number((total * 0.35).toFixed(2)),
    meals: Number((total * 0.15).toFixed(2)),
    tickets: Number((total * 0.1).toFixed(2)),
    activities: Number((total * 0.12).toFixed(2)),
    localTransport: Number((total * 0.05).toFixed(2)),
    other: Number((total * 0.03).toFixed(2)),
  };
}

export function reorderItineraryItems<T extends { id: string; order: number }>(items: T[], fromId: string, toId: string): T[] {
  if (fromId === toId) return items;

  const next = [...items];
  const fromIndex = next.findIndex((item) => item.id === fromId);
  const toIndex = next.findIndex((item) => item.id === toId);

  if (fromIndex === -1 || toIndex === -1) return items;

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next.map((item, index) => ({ ...item, order: index + 1 }));
}

export function validateFavoriteTarget(target: { type: string; targetId: string }): string[] {
  const errors: string[] = [];
  if (!target.type || (target.type !== "destination" && target.type !== "place")) {
    errors.push("El tipo de favorito no es válido.");
  }
  if (!target.targetId.trim()) {
    errors.push("El identificador del favorito es obligatorio.");
  }
  return errors;
}
