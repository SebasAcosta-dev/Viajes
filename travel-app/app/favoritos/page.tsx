import Link from "next/link";
import { FavoriteDestinations } from "@/app/components/favorite-destinations";

export default function FavoritosPage() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Favoritos</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Mis destinos preferidos</h1>
        </div>
        <Link href="/" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Inicio</Link>
      </div>
      <FavoriteDestinations />
    </main>
  );
}
