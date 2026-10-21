import Link from "next/link";
import { TripsManager } from "@/features/trips/components/trips-manager";
import { CombinedTripPlanner } from "@/features/trips/components/combined-trip-planner";

export default function ViajesPage() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Viajes</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Mis viajes</h1>
        </div>
        <Link href="/planificar" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Crear viaje</Link>
      </div>
      <TripsManager view="trips" />
      <CombinedTripPlanner />
    </main>
  );
}
