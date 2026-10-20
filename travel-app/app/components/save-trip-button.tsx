"use client";

import Link from "next/link";
import { useState } from "react";
import { persistenceLabel, saveTrip } from "@/app/lib/persistence/client";
import type { TripDraft } from "@/app/lib/persistence/types";

export function SaveTripButton({ draft }: { draft: TripDraft }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveTrip(draft);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el viaje.");
    } finally {
      setSaving(false);
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
          Viaje guardado correctamente en {persistenceLabel()}. <Link className="font-semibold underline" href="/viajes">Ver mis viajes</Link>
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error} {error.includes("Inicia sesión") && <Link className="font-semibold underline" href="/cuenta">Iniciar sesión</Link>}
        </p>
      )}
    </div>
  );
}
