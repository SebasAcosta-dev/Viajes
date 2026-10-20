"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Inicio" },
  { href: "/destinos", label: "Explorar destinos" },
  { href: "/planificar", label: "Planificar viaje" },
  { href: "/viajes", label: "Mis viajes" },
  { href: "/mapa", label: "Mapa" },
  { href: "/favoritos", label: "Favoritos" },
  { href: "/presupuesto", label: "Presupuesto" },
  { href: "/ia", label: "Asistente IA" },
  { href: "/perfil", label: "Mi perfil" },
  { href: "/cuenta", label: "Cuenta" },
];

export function SiteNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:px-8 2xl:px-10">
        <Link href="/" className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Viajes</span>
          <span className="block text-lg font-bold leading-tight text-slate-900 sm:text-xl">Planificador inteligente</span>
        </Link>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 md:hidden"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
          <span>{menuOpen ? "Cerrar menú" : "Menú"}</span>
        </button>
        <nav
          id="primary-navigation"
          aria-label="Navegación principal"
          className={`${menuOpen ? "grid" : "hidden"} w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid md:w-auto md:flex-1 md:grid-cols-3 md:gap-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10`}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="flex min-h-11 min-w-0 items-center justify-center rounded-xl px-2 py-2 text-center text-sm font-medium leading-tight text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-3"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
