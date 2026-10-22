"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { destinations } from "@/lib/data/demo-data";
import { listFavorites, persistenceLabel, toggleFavorite } from "@/lib/persistence/client";
import type { FavoriteDestination } from "@/lib/persistence/types";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";

export function FavoriteDestinations() {
  const [favorites, setFavorites] = useState<FavoriteDestination[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError("");
    try {
      await getPlannerDraftScope();
      setFavorites(await listFavorites());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los favoritos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const remove = async (favorite: FavoriteDestination) => {
    setError("");
    try {
      setFavorites(await toggleFavorite(favorite.destinationSlug, favorite.destinationName));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo actualizar el favorito.");
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Cargando favoritos...</p>;
  return (
    <section>
      <p className="mb-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Almacenamiento: {persistenceLabel()}</p>
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error} {error.includes("Inicia sesión") && <Link className="font-semibold underline" href="/cuenta">Iniciar sesión</Link>}
        </div>
      )}
      {favorites.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No hay destinos favoritos guardados. Explora destinos para guardar los que te interesan.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {favorites.map((favorite) => {
            const destination = destinations.find((item) => item.slug === favorite.destinationSlug);
            return (
              <article key={favorite.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold">{destination?.name ?? favorite.destinationName}</h2>
                  <button onClick={() => void remove(favorite)} className="min-h-11 rounded-full border border-red-200 px-4 py-2 text-sm text-red-700">Quitar</button>
                </div>
                {destination ? (
                  <>
                    <p className="mt-2 text-sm text-slate-600">{destination.country} · {destination.region}</p>
                    <p className="mt-4 text-sm text-slate-600">{destination.description}</p>
                  </>
                ) : <p className="mt-2 text-sm text-slate-600">Destino {favorite.destinationSlug}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
