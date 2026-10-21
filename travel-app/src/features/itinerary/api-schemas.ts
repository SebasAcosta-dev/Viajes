import type { ItineraryItem } from "@/lib/types";
import { validateActivityUpdate } from "@/lib/persistence/validation";
import { schemaFromValidator } from "@/lib/api/http";

export const activityUpdateRequestSchema = schemaFromValidator<Partial<ItineraryItem>>(
  validateActivityUpdate,
  "Los datos de la actividad no son válidos.",
);
