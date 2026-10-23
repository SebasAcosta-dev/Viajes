import Link from "next/link";
import { TripsManager } from "@/features/trips/components/trips-manager";
import { PageHeading } from "@/components/ui";

export default function PresupuestoPage() {
  return (
    <main className="budget-page mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <PageHeading eyebrow="Control claro" title="Presupuesto y gastos" description="Consulta estimaciones y gastos reales por viaje y moneda."
        actions={<Link href="/viajes" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Ver mis viajes</Link>} />
      <p className="mb-5 max-w-4xl text-base leading-relaxed text-slate-600">Actualiza el presupuesto y registra gastos reales. Las estimaciones del itinerario, los gastos realizados y el restante se muestran por separado; no se convierten ni mezclan monedas.</p>
      <TripsManager view="budget" />
    </main>
  );
}
