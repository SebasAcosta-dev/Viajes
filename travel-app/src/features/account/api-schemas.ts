import type { ProfilePreferences } from "@/lib/types";
import { validateProfilePreferences } from "@/lib/profile-preferences";
import { schemaFromValidator } from "@/lib/api/http";
import { z } from "zod";

export const profilePreferencesRequestSchema = schemaFromValidator<ProfilePreferences>(
  validateProfilePreferences,
  "Las preferencias del perfil no son válidas.",
);

export const favoriteDestinationRequestSchema = z.object({
  destinationSlug: z.string().regex(/^[a-z0-9-]{1,80}$/),
}).strict();
