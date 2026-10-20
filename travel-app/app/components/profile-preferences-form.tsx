"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InterestPicker } from "@/app/components/interest-picker";
import { getProfilePreferences, saveProfilePreferences } from "@/app/lib/persistence/profile-client";
import { persistenceLabel } from "@/app/lib/persistence/client";
import type { ProfilePreferences, TravelType } from "@/app/lib/types";
import { allTravelInterests } from "@/app/lib/interest-catalog";

const emptyPreferences: ProfilePreferences = {
  name: "",
  language: "es",
  currency: "EUR",
  interests: [],
  pace: "equilibrado",
  budgetPreference: "",
  travelTypes: [],
};

const travelTypes: TravelType[] = [
  "Económico", "Cultural", "Gastronómico", "Naturaleza", "Relax", "Aventura", "Familiar", "Combinado",
];

export function ProfilePreferencesForm() {
  const [preferences, setPreferences] = useState<ProfilePreferences>(emptyPreferences);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void getProfilePreferences()
      .then((saved) => {
        setPreferences(saved);
        setCustomInterests(saved.interests.filter((interest) => !(allTravelInterests as readonly string[]).includes(interest)));
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las preferencias."))
      .finally(() => setLoading(false));
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveProfilePreferences({
        ...preferences,
        interests: [...new Set([
          ...preferences.interests.filter((interest) => (allTravelInterests as readonly string[]).includes(interest)),
          ...customInterests,
        ])],
      });
      setPreferences(saved);
      setNotice(`Preferencias guardadas en ${persistenceLabel()}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudieron guardar las preferencias.");
    } finally {
      setSaving(false);
    }
  };

  const selectedCatalogInterests = preferences.interests.filter((interest) =>
    (allTravelInterests as readonly string[]).includes(interest),
  );

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-6">
      <p className="max-w-5xl text-base leading-relaxed text-slate-600">Estas preferencias se guardan en tu perfil y solo se usan como valores iniciales. Los intereses que elijas para un viaje concreto tienen prioridad.</p>
      <p className="text-sm text-slate-500">Almacenamiento: {persistenceLabel()}</p>
      {loading ? <p role="status">Cargando preferencias…</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Nombre para el saludo
              <input value={preferences.name} maxLength={120} onChange={(event) => setPreferences({ ...preferences, name: event.target.value })} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Moneda preferida
              <select value={preferences.currency} onChange={(event) => setPreferences({ ...preferences, currency: event.target.value as ProfilePreferences["currency"] })} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5">
                {(["EUR", "USD", "GBP", "MAD"] as const).map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Ritmo habitual
              <select value={preferences.pace} onChange={(event) => setPreferences({ ...preferences, pace: event.target.value })} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5">
                <option value="lento">Tranquilo</option>
                <option value="equilibrado">Equilibrado</option>
                <option value="rápido">Activo</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Preferencia de presupuesto
              <input value={preferences.budgetPreference} maxLength={80} onChange={(event) => setPreferences({ ...preferences, budgetPreference: event.target.value })} placeholder="Por ejemplo: priorizar actividades gratuitas" className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </label>
          </div>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-slate-800">Tipos de viaje favoritos</legend>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {travelTypes.map((travelType) => {
                const checked = preferences.travelTypes.includes(travelType);
                return (
                  <label key={travelType} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 py-2 text-sm ${checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => setPreferences({
                      ...preferences,
                      travelTypes: checked
                        ? preferences.travelTypes.filter((type) => type !== travelType)
                        : [...preferences.travelTypes, travelType],
                    })} />
                    {travelType}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <InterestPicker
            selected={selectedCatalogInterests}
            customInterests={customInterests}
            onSelectedChange={(interests) => setPreferences((current) => ({
              ...current,
              interests: [...interests, ...customInterests],
            }))}
            onCustomInterestsChange={(interests) => {
              setCustomInterests(interests);
              setPreferences((current) => ({
                ...current,
                interests: [
                  ...current.interests.filter((interest) => (allTravelInterests as readonly string[]).includes(interest)),
                  ...interests,
                ],
              }));
            }}
          />
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error} {error.includes("Inicia sesión") && <Link href="/cuenta" className="font-semibold underline">Iniciar sesión</Link>}</p>}
          {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar preferencias"}
          </button>
        </>
      )}
    </form>
  );
}
