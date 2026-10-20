import Link from "next/link";
import { TripsManager } from "@/app/components/trips-manager";

export default function PresupuestoPage() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Presupuesto</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Presupuesto y gastos</h1>
        </div>
        <Link href="/" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Inicio</Link>
      </div>
      <p className="mb-5 max-w-4xl text-base leading-relaxed text-slate-600">Actualiza el presupuesto y registra gastos reales. Las estimaciones del itinerario, los gastos realizados y el restante se muestran por separado; no se convierten ni mezclan monedas.</p>
      <TripsManager view="budget" />
    </main>
  );
}
