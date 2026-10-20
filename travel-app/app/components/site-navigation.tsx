"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Inicio" },
  { href: "/viajes", label: "Mis viajes" },
  { href: "/mapa", label: "Mapa" },
  { href: "/presupuesto", label: "Presupuesto" },
  { href: "/cuenta", label: "Cuenta" },
];

function getActiveNavigationHref(pathname: string): string {
  if (pathname === "/") return "/";
  if (pathname === "/mapa") return "/mapa";
  if (pathname === "/presupuesto") return "/presupuesto";
  if (pathname === "/cuenta" || pathname === "/perfil" || pathname === "/favoritos") return "/cuenta";
  return "/viajes";
}

export function SiteNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const activeHref = getActiveNavigationHref(pathname);

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:px-8 2xl:px-10">
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
          className={`${menuOpen ? "grid" : "hidden"} w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid md:w-auto md:flex-1 md:grid-cols-5 md:gap-1 lg:gap-2`}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={activeHref === item.href ? "page" : undefined}
              className={`flex min-h-11 min-w-0 items-center justify-center rounded-xl px-2 py-2 text-center text-sm font-semibold leading-tight transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-3 ${
                activeHref === item.href
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
