import Link from "next/link";
import { destinations } from "@/app/data/demo-data";

export default function MapaPage() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Mapa</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Mapa interactivo</h1>
        </div>
        <Link href="/" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Inicio</Link>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {destinations.map((destination) => (
            <div key={destination.id} className="rounded-2xl bg-slate-50 p-4">
              <p className="font-medium text-slate-800">{destination.name}</p>
              <p className="text-sm text-slate-600">{destination.country}</p>
              <p className="mt-2 text-xs text-slate-500">Lat: {destination.lat.toFixed(4)} · Lng: {destination.lng.toFixed(4)}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          La integración real con Leaflet y OpenStreetMap está preparada para conectarse con un componente cartográfico; por ahora se muestran coordenadas y marcadores conceptuales con datos demo no verificados.
        </p>
      </div>
    </main>
  );
}
