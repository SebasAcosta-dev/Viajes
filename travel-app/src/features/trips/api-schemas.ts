import { z } from "zod";
import type { TripDraft } from "@/lib/persistence/types";
import { validateTripDraft } from "@/lib/persistence/validation";
import { schemaFromValidator } from "@/lib/api/http";
import type { Currency, TripStatus } from "@/lib/types";
import { isCurrency } from "@/lib/currency-catalog";

const tripStatuses: TripStatus[] = ["borrador", "planificado", "activo", "completado"];
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "La fecha no es válida.");

export const tripDraftRequestSchema = schemaFromValidator<TripDraft>(validateTripDraft, "Los datos del viaje o itinerario no son válidos.");

export const tripUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  origin: z.string().trim().max(160).optional(),
  destination: z.string().trim().min(1).max(160).optional(),
  startDate: isoDateSchema.nullable().optional(),
  endDate: isoDateSchema.nullable().optional(),
  travelers: z.number().int().min(1).max(100).optional(),
  budget: z.number().finite().min(0).optional(),
  currency: z.custom<Currency>(isCurrency, "La moneda no es válida.").optional(),
  status: z.enum(tripStatuses).optional(),
}).strict().superRefine((value, context) => {
  if (typeof value.startDate === "string" && typeof value.endDate === "string" && value.endDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "La fecha de regreso no puede ser anterior a la salida." });
  }
  if (Object.keys(value).length === 0) context.addIssue({ code: "custom", message: "No se han indicado cambios válidos." });
});

export const tripGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  items: z.array(z.object({
    tripId: z.string().uuid(),
    startDate: isoDateSchema.nullable(),
    endDate: isoDateSchema.nullable(),
  }).strict().superRefine((item, context) => {
    if (item.startDate && item.endDate && item.endDate < item.startDate) {
      context.addIssue({ code: "custom", path: ["endDate"], message: "La fecha de regreso no puede ser anterior a la salida." });
    }
  })).min(1).max(12),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.tripId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["items"], message: "No se puede incluir el mismo viaje más de una vez." });
});

export const reorderActivitiesRequestSchema = z.object({
  activityIds: z.array(z.string().uuid()).max(12),
}).strict().superRefine((value, context) => {
  if (new Set(value.activityIds).size !== value.activityIds.length) {
    context.addIssue({ code: "custom", path: ["activityIds"], message: "El orden de actividades no puede repetir identificadores." });
  }
});

export const regeneratedDayRequestSchema = z.object({
  day: z.record(z.string(), z.unknown()),
}).strict();
