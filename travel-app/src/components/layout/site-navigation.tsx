"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Inicio", icon: "⌂" },
  { href: "/viajes", label: "Mis viajes", icon: "▤" },
  { href: "/mapa", label: "Mapa", icon: "⌖" },
  { href: "/presupuesto", label: "Presupuesto", icon: "◉" },
  { href: "/cuenta", label: "Cuenta", icon: "◌" },
];

function getActiveNavigationHref(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/destinos")) return "/";
  if (["/planificar", "/ia", "/itinerario", "/viajes", "/calendario"].some((route) => pathname === route || pathname.startsWith(`${route}/`))) return "/viajes";
  if (pathname === "/mapa" || pathname.startsWith("/mapa/")) return "/mapa";
  if (pathname === "/presupuesto" || pathname.startsWith("/presupuesto/")) return "/presupuesto";
  if (["/cuenta", "/perfil", "/favoritos"].some((route) => pathname === route || pathname.startsWith(`${route}/`))) return "/cuenta";
  return "/";
}

export function SiteNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const activeHref = getActiveNavigationHref(pathname);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand-lockup" aria-label="Viajes, inicio">
          <span className="brand-mark" aria-hidden="true">✳</span>
          <span className="brand-copy">
            <span className="brand-name">viajes</span>
            <span className="brand-caption">PLANIFICADOR INTELIGENTE</span>
          </span>
        </Link>
        <button
          type="button"
          className="menu-toggle"
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
          className={`primary-navigation ${menuOpen ? "is-open" : ""}`}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={activeHref === item.href ? "page" : undefined}
              className={`primary-navigation-link ${activeHref === item.href ? "is-active" : ""}`}
            >
              <span className="navigation-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/cuenta" className="header-account" aria-label="Abrir cuenta">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.7" />
            <path d="M5.5 20c.65-3.3 2.9-5 6.5-5s5.85 1.7 6.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
