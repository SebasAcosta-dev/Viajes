"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { destinations } from "@/lib/data/demo-data";
import { PageHeading } from "@/components/ui";
import { listFavorites, persistenceLabel, toggleFavorite } from "@/lib/persistence/client";
import { getPlannerDraftScope } from "@/lib/persistence/profile-client";
import type { FavoriteDestination } from "@/lib/persistence/types";

export default function DestinationsPage() {
  const [favorites, setFavorites] = useState<FavoriteDestination[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getPlannerDraftScope()
      .then(() => listFavorites())
      .then((result) => { if (active) setFavorites(result); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar tus destinos guardados."); })
      .finally(() => { if (active) setLoadingFavorites(false); });
    return () => { active = false; };
  }, []);

  const saveFavorite = async (slug: string, name: string) => {
    setError("");
    try {
      setFavorites(await toggleFavorite(slug, name));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo actualizar el destino guardado.");
    }
  };

  return (
    <main className="destinations-page mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <PageHeading eyebrow="Inspiración para tu próxima escapada" title="Explorar destinos" description="Ideas para elegir el ritmo y el lugar de tu próximo viaje."
        actions={<Link href="/planificar" className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">Planificar un viaje</Link>} />

      <p className="mb-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Almacenamiento: {persistenceLabel()}</p>
      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}

      <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {destinations.map((destination) => (
          <article key={destination.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-48 bg-cover bg-center" style={{ backgroundImage: `url(${destination.image})` }} />
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="min-w-0 text-xl font-semibold sm:text-2xl">{destination.name}</h2>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">{destination.country}</span>
                  <button type="button" aria-pressed={favorites.some((favorite) => favorite.destinationSlug === destination.slug)} disabled={loadingFavorites} onClick={() => void saveFavorite(destination.slug, destination.name)} className="min-h-10 rounded-full border border-emerald-800 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60">
                    {loadingFavorites ? "Cargando" : favorites.some((favorite) => favorite.destinationSlug === destination.slug) ? "Guardado" : "Guardar"}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-base leading-relaxed text-slate-600">{destination.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                {destination.categories.map((category) => (
                  <span key={category} className="rounded-full bg-slate-100 px-2.5 py-1">{category}</span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
                <span>Duración: {destination.recommendedDuration}</span>
                <span>Presupuesto: {destination.budgetEstimate}€</span>
              </div>
              <p className="mt-4 text-xs text-slate-500">{destination.sourceLabel}</p>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
