import { z } from "zod";

const optionalText = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().url().optional(),
);

const publicEnvironmentSchema = z.object({
  appMode: z.preprocess((value) => value === "" ? undefined : value, z.enum(["demo", "production"]).default("demo")),
  dataMode: z.preprocess((value) => value === "" ? undefined : value, z.enum(["demo", "supabase"]).default("demo")),
  supabaseUrl: optionalUrl,
  supabasePublishableKey: optionalText,
  siteUrl: optionalUrl,
  vercelEnvironment: optionalText,
  vercelUrl: optionalText,
  vercelProductionUrl: optionalText,
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(source: Record<string, string | undefined>): PublicEnvironment {
  try {
    return publicEnvironmentSchema.parse({
      appMode: source.NEXT_PUBLIC_APP_MODE,
      dataMode: source.NEXT_PUBLIC_DATA_MODE,
      supabaseUrl: source.NEXT_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      siteUrl: source.NEXT_PUBLIC_SITE_URL,
      vercelEnvironment: source.NEXT_PUBLIC_VERCEL_ENV,
      vercelUrl: source.NEXT_PUBLIC_VERCEL_URL,
      vercelProductionUrl: source.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const field = error.issues[0]?.path[0];
      const variable = field === "appMode" ? "NEXT_PUBLIC_APP_MODE"
        : field === "dataMode" ? "NEXT_PUBLIC_DATA_MODE"
          : field === "supabaseUrl" ? "NEXT_PUBLIC_SUPABASE_URL"
            : field === "supabasePublishableKey" ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
              : field === "siteUrl" ? "NEXT_PUBLIC_SITE_URL"
                : field === "vercelEnvironment" ? "NEXT_PUBLIC_VERCEL_ENV"
                  : field === "vercelUrl" ? "NEXT_PUBLIC_VERCEL_URL"
                    : "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL";
      throw new Error(`${variable}: ${error.issues[0]?.message ?? "valor no válido"}`);
    }
    throw error;
  }
}

export function getPublicEnvironment(): PublicEnvironment {
  return parsePublicEnvironment({
    NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE,
    NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  });
}
