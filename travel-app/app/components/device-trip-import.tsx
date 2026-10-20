"use client";

import { useEffect, useState } from "react";
import { countDeviceTripsPendingImport, importDeviceTripsToAccount } from "@/app/lib/persistence/client";

export function DeviceTripImport() {
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void countDeviceTripsPendingImport().then((pending) => {
      if (!active || pending === 0) return;
      setCount(pending);
      setReady(true);
    }).catch(() => {
      if (active) setReady(false);
    });
    return () => { active = false; };
  }, []);

  const importTrips = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await importDeviceTripsToAccount();
      setMessage(result.skippedPast > 0
        ? `Se importaron ${result.imported} viajes. ${result.skippedPast} viaje(s) con salida pasada se conservaron en este dispositivo para evitar cambiar sus fechas. Los originales no se eliminan.`
        : result.imported > 0
          ? `Se importaron ${result.imported} de ${result.total} viajes. Los originales siguen guardados en este dispositivo.`
          : "No hay viajes nuevos que importar. Los que ya se importaron no se duplicaron.");
      setCount(result.skippedPast);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "No se pudieron importar los viajes; los borradores locales se conservaron.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || (count === 0 && !message)) return null;
  return (
    <section className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" aria-label="Importar viajes del dispositivo">
      {count > 0 && <>
        <h2 className="font-semibold">Tienes {count} viaje(s) guardado(s) en este dispositivo</h2>
        <p className="mt-1">Puedes copiarlos a tu cuenta para sincronizarlos. La importación incluye datos del viaje e itinerario; los gastos no se importan. Los borradores originales no se eliminan.</p>
      </>}
      {error && <p className="mt-3 text-red-800" role="alert">{error}</p>}
      {message && <p className="mt-3 text-emerald-800" role="status">{message}</p>}
      {count > 0 && <button type="button" disabled={busy} onClick={() => void importTrips()} className="mt-3 min-h-10 rounded-lg bg-sky-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? "Importando…" : "Importar viajes a mi cuenta"}
      </button>}
    </section>
  );
}
