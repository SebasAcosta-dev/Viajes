import "server-only";

import { z } from "zod";

const optionalText = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const serverEnvironmentSchema = z.object({
  aiApiKey: optionalText,
  aiProvider: optionalText,
  aiModel: optionalText,
  geoapifyApiKey: optionalText,
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(source: Record<string, string | undefined>): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    aiApiKey: source.AI_API_KEY,
    aiProvider: source.AI_PROVIDER,
    aiModel: source.AI_MODEL,
    geoapifyApiKey: source.GEOAPIFY_API_KEY,
  });
}

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment({
    AI_API_KEY: process.env.AI_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    GEOAPIFY_API_KEY: process.env.GEOAPIFY_API_KEY,
  });
}
