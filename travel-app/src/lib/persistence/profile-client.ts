"use client";

import { defaultProfile } from "@/lib/data/demo-data";
import { getPersistenceMode, setVisitorLocalMode } from "@/lib/persistence/mode";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { validateProfilePreferences } from "@/lib/profile-preferences";
import type { ProfilePreferences } from "@/lib/types";
import { getPublicEnvironment } from "@/lib/env";
import { localPersistenceAdapter } from "@/lib/persistence/local-adapter";

const PROFILE_KEY = "viajes.profile.preferences.v1";
const ANONYMOUS_SCOPE_KEY = "viajes.anonymous.scope.v1";

function anonymousScope(): string {
  let id = localPersistenceAdapter.getItem(ANONYMOUS_SCOPE_KEY)
    ?? localPersistenceAdapter.getItem(ANONYMOUS_SCOPE_KEY, "session");
  if (!id) {
    id = crypto.randomUUID();
  }
  localPersistenceAdapter.setItem(ANONYMOUS_SCOPE_KEY, id);
  return `anonymous:${id}`;
}

export async function getPlannerDraftScope(): Promise<string> {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnvironment();
  if (!supabaseUrl || !supabasePublishableKey) {
    setVisitorLocalMode(true);
    return "anonymous";
  }
  const { data, error } = await createSupabaseBrowserClient().auth.getUser();
  if (error) throw new Error("No se pudo comprobar la sesión para aislar el borrador del planificador.");
  setVisitorLocalMode(!data.user);
  return data.user ? `user:${data.user.id}` : anonymousScope();
}

async function requestProfile(method: "GET" | "PUT", preferences?: ProfilePreferences): Promise<ProfilePreferences> {
  const response = await fetch("/api/profile", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(preferences ? { body: JSON.stringify(preferences) } : {}),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("El servidor no devolvió una respuesta de perfil válida.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("El servidor devolvió una respuesta inesperada para el perfil.");
  }
  const result = body as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "No se pudo guardar el perfil.");
  }
  const parsed = validateProfilePreferences(result.preferences);
  if (!parsed) throw new Error("El servidor no confirmó las preferencias del perfil.");
  return parsed;
}

export async function getProfilePreferences(): Promise<ProfilePreferences> {
  const scope = await getPlannerDraftScope();
  if (getPersistenceMode() === "supabase" && scope.startsWith("user:")) return requestProfile("GET");
  if (getPersistenceMode() === "supabase") throw new Error("Inicia sesión para consultar las preferencias privadas de tu cuenta.");
  const key = `${PROFILE_KEY}.${encodeURIComponent(scope)}`;
  const serialized = localPersistenceAdapter.getItem(key)
    ?? (scope === "anonymous" ? localPersistenceAdapter.getItem(PROFILE_KEY) : null);
  if (!serialized) return { ...defaultProfile };
  try {
    const parsed = validateProfilePreferences(JSON.parse(serialized));
    if (!parsed) throw new Error("Las preferencias locales tienen un formato inválido.");
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "Las preferencias locales tienen un formato inválido.") throw error;
    throw new Error("Las preferencias locales están dañadas y no se han sobrescrito.");
  }
}

export async function saveProfilePreferences(preferences: ProfilePreferences): Promise<ProfilePreferences> {
  const validated = validateProfilePreferences(preferences);
  if (!validated) throw new Error("Las preferencias del perfil no son válidas.");
  const scope = await getPlannerDraftScope();
  if (getPersistenceMode() === "supabase" && scope.startsWith("user:")) return requestProfile("PUT", validated);
  if (getPersistenceMode() === "supabase") throw new Error("Inicia sesión para guardar las preferencias privadas de tu cuenta.");
  localPersistenceAdapter.setItem(`${PROFILE_KEY}.${encodeURIComponent(scope)}`, JSON.stringify(validated));
  return validated;
}
