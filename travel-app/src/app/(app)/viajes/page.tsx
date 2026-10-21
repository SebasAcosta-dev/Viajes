import Link from "next/link";
import { TripsManager } from "@/features/trips/components/trips-manager";
import { CombinedTripPlanner } from "@/features/trips/components/combined-trip-planner";
import { PageHeading } from "@/components/ui";

export default function ViajesPage() {
  return (
    <main className="trips-page mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <PageHeading eyebrow="Tu colección" title="Mis viajes" description="Tus planes, itinerarios y escapadas organizados en un mismo lugar."
        actions={<Link href="/planificar" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Crear viaje</Link>} />
      <TripsManager view="trips" />
      <CombinedTripPlanner />
    </main>
  );
}
