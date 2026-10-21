import Link from "next/link";
import { destinations } from "@/lib/data/demo-data";
import { PageHeading } from "@/components/ui";

export default function DestinationsPage() {
  return (
    <main className="destinations-page mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <PageHeading eyebrow="Inspiración para tu próxima escapada" title="Explorar destinos" description="Ideas para elegir el ritmo y el lugar de tu próximo viaje."
        actions={<Link href="/planificar" className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">Planificar un viaje</Link>} />

      <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {destinations.map((destination) => (
          <article key={destination.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-48 bg-cover bg-center" style={{ backgroundImage: `url(${destination.image})` }} />
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="min-w-0 text-xl font-semibold sm:text-2xl">{destination.name}</h2>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">{destination.country}</span>
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
