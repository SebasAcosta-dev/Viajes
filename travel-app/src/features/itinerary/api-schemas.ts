import type { ItineraryItem } from "@/lib/types";
import { validateActivityCreate, validateActivityUpdate } from "@/lib/persistence/validation";
import { schemaFromValidator } from "@/lib/api/http";

export const activityUpdateRequestSchema = schemaFromValidator<Partial<ItineraryItem>>(
  validateActivityUpdate,
  "Los datos de la actividad no son válidos.",
);

export const activityCreateRequestSchema = schemaFromValidator<ReturnType<typeof validateActivityCreate> & {}>(
  validateActivityCreate,
  "Los datos de la nueva actividad no son válidos.",
);
