import Link from "next/link";
import { ProfilePreferencesForm } from "@/app/components/profile-preferences-form";

export default function PerfilPage() {
  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Cuenta</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Preferencias de viaje</h1>
        </div>
        <Link href="/cuenta" className="min-h-11 rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white">Volver a Cuenta</Link>
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7 lg:p-8">
        <ProfilePreferencesForm />
      </section>
    </main>
  );
}
