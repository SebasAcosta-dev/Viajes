import Link from "next/link";
import { destinations, seedTrips } from "@/lib/data/demo-data";
import { generateItineraryFromTrip } from "@/lib/itinerary";
import { SaveTripButton } from "@/features/trips/components/save-trip-button";
import { ManualTripPlanner } from "@/features/itinerary/components/manual-trip-planner";
import { PageHeading } from "@/components/ui";
import { formatMoney } from "@/lib/money";

const exampleForm = {
  origin: "Madrid",
  destination: "Marrakech",
  startDate: "2026-04-12",
  endDate: "2026-04-16",
  travelers: 2,
  budget: 800,
  currency: "EUR" as const,
  interests: ["Cultura", "Gastronomía"],
  travelType: "Cultural" as const,
  pace: "equilibrado",
  notes: "Busco una mezcla de historia, comida y paseos tranquilos.",
};

export default function PlanificarPage() {
  const destination = destinations.find((item) => item.name === exampleForm.destination) ?? destinations[0];
  const itinerary = generateItineraryFromTrip(destination, exampleForm);

  return (
    <main className="planner-page mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <PageHeading eyebrow="Tu próxima historia" title="Planifica un viaje" description="Define tus fechas y preferencias. El itinerario se puede revisar antes de guardarlo."
        actions={<Link href="/destinos" className="min-h-11 rounded-full border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-800">Explorar destinos</Link>} />

      <ManualTripPlanner />

      <details className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <summary className="cursor-pointer text-lg font-semibold">Ver ejemplo local del catálogo y plan de demostración</summary>
      <div className="mt-4 grid min-w-0 gap-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] 2xl:gap-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Configuración</h2>
          <dl className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="flex justify-between gap-4"><dt>Origen</dt><dd>{exampleForm.origin}</dd></div>
            <div className="flex justify-between gap-4"><dt>Destino</dt><dd>{exampleForm.destination}</dd></div>
            <div className="flex justify-between gap-4"><dt>Fechas</dt><dd>{exampleForm.startDate} → {exampleForm.endDate}</dd></div>
            <div className="flex justify-between gap-4"><dt>Viajeros</dt><dd>{exampleForm.travelers}</dd></div>
            <div className="flex justify-between gap-4"><dt>Presupuesto</dt><dd>{formatMoney(exampleForm.budget, exampleForm.currency)}</dd></div>
          </dl>
        </section>

        <section className="min-w-0 space-y-4">
          {itinerary.map((day) => (
            <article key={day.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Día {day.dayNumber}</p>
                  <h3 className="text-xl font-semibold">{day.theme}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{day.date}</span>
              </div>
              <p className="mb-4 text-sm text-slate-600">{day.summary}</p>
              <div className="space-y-3">
                {day.items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-800">{item.name}</p>
                        <p className="text-sm text-slate-600">{item.description}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.08em] text-emerald-800">{item.source}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                      <span>{item.startTime} - {item.endTime}</span>
                      <span>{item.durationMinutes} min</span>
                      <span>{item.estimate === undefined ? "Sin estimación" : formatMoney(item.estimate, item.currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Guardar este plan de demostración</h2>
        <p className="mt-2 text-sm text-slate-600">Este ejemplo usa datos locales orientativos; puedes guardarlo para probar la persistencia o usa el asistente para generar otro itinerario.</p>
        <SaveTripButton
          draft={{
            name: `${exampleForm.destination} cultural`,
            origin: exampleForm.origin,
            destination: exampleForm.destination,
            startDate: exampleForm.startDate,
            endDate: exampleForm.endDate,
            travelers: exampleForm.travelers,
            budget: exampleForm.budget,
            currency: exampleForm.currency,
            interests: exampleForm.interests,
            travelType: exampleForm.travelType,
            status: "planificado",
            itinerary,
          }}
        />
      </section>

      <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Ejemplo de viaje de demostración</h2>
        <p className="mt-2 text-sm text-slate-600">Este viaje precargado no se guarda automáticamente. Pulsa «Guardar viaje» para añadir el plan actual a tu almacenamiento.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {seedTrips.map((trip) => (
            <div key={trip.id} className="rounded-2xl bg-slate-50 p-4">
              <p className="font-medium text-slate-800">{trip.name}</p>
              <p className="mt-2 text-sm text-slate-600">{trip.destination} · {trip.status}</p>
              <p className="mt-2 text-xs text-slate-500">{trip.startDate} - {trip.endDate}</p>
            </div>
          ))}
        </div>
      </section>
      </details>
    </main>
  );
}
