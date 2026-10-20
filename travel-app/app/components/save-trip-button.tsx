"use client";

import Link from "next/link";
import { useState } from "react";
import { persistenceLabel, saveTrip, saveTripToDevice } from "@/app/lib/persistence/client";
import { getPersistenceMode } from "@/app/lib/persistence/mode";
import { getPlannerDraftScope } from "@/app/lib/persistence/profile-client";
import type { TripDraft } from "@/app/lib/persistence/types";

export function SaveTripButton({ draft }: { draft: TripDraft }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedLocation, setSavedLocation] = useState("");
  const [showVisitorOptions, setShowVisitorOptions] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const scope = await getPlannerDraftScope();
      if (scope.startsWith("user:") && getPersistenceMode() === "supabase") {
        await saveTrip(draft);
        setSavedLocation("Supabase");
        setSaved(true);
      } else if (getPersistenceMode() === "demo") {
        saveTripToDevice(draft);
        setSavedLocation(persistenceLabel());
        setSaved(true);
      } else {
        setShowVisitorOptions(true);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el viaje.");
    } finally {
      setSaving(false);
    }
  };

  const saveOnDevice = () => {
    setError("");
    try {
      saveTripToDevice(draft);
      setSavedLocation("este dispositivo");
      setShowVisitorOptions(false);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el viaje en este dispositivo.");
    }
  };

  return (
    <div className="mt-4">
      {!saved ? (
        <button onClick={() => void save()} disabled={saving} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Guardando..." : "Guardar viaje"}
        </button>
      ) : (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Viaje guardado correctamente en {savedLocation || persistenceLabel()}. <Link className="font-semibold underline" href="/viajes">Ver mis viajes</Link>
        </p>
      )}
      {showVisitorOptions && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" role="group" aria-label="Opciones para guardar el viaje">
          <p className="font-semibold">Estás usando Viajes como visitante.</p>
          <p className="mt-1">Guardar en este dispositivo conserva el borrador en este navegador. Una cuenta permite sincronizarlo de forma privada con Supabase.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={saveOnDevice} className="min-h-10 rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white">Guardar en este dispositivo</button>
            <Link className="min-h-10 rounded-lg border border-sky-800 px-3 py-2 font-semibold" href="/cuenta">Crear una cuenta</Link>
            <Link className="min-h-10 rounded-lg border border-sky-800 px-3 py-2 font-semibold" href="/cuenta">Iniciar sesión</Link>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error} {error.includes("Inicia sesión") && <Link className="font-semibold underline" href="/cuenta">Iniciar sesión</Link>}
        </p>
      )}
    </div>
  );
}
