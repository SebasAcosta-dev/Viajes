"use client";

import { defaultProfile } from "@/app/data/demo-data";
import { getPersistenceMode } from "@/app/lib/persistence/mode";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { validateProfilePreferences } from "@/app/lib/profile-preferences";
import type { ProfilePreferences } from "@/app/lib/types";

const PROFILE_KEY = "viajes.profile.preferences.v1";
const ANONYMOUS_SCOPE_KEY = "viajes.anonymous.scope.v1";

function anonymousScope(): string {
  let id = sessionStorage.getItem(ANONYMOUS_SCOPE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(ANONYMOUS_SCOPE_KEY, id);
  }
  return `anonymous:${id}`;
}

export async function getPlannerDraftScope(): Promise<string> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return "anonymous";
  }
  const { data, error } = await createSupabaseBrowserClient().auth.getUser();
  if (error) throw new Error("No se pudo comprobar la sesión para aislar el borrador del planificador.");
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
  if (getPersistenceMode() === "supabase") return requestProfile("GET");
  const scope = await getPlannerDraftScope();
  const key = `${PROFILE_KEY}.${encodeURIComponent(scope)}`;
  const serialized = localStorage.getItem(key) ?? (scope === "anonymous" ? localStorage.getItem(PROFILE_KEY) : null);
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
  if (getPersistenceMode() === "supabase") return requestProfile("PUT", validated);
  const scope = await getPlannerDraftScope();
  localStorage.setItem(`${PROFILE_KEY}.${encodeURIComponent(scope)}`, JSON.stringify(validated));
  return validated;
}
