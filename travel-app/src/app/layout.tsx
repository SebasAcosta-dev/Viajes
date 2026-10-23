import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viajes | Planificador inteligente",
  description: "Plataforma para explorar destinos, planificar viajes y gestionar presupuestos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
