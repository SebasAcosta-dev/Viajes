import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNavigation } from "@/app/components/site-navigation";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Viajes | Planificador inteligente",
  description: "Plataforma para explorar destinos, planificar viajes y gestionar presupuestos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <SiteNavigation />
        {children}
      </body>
    </html>
  );
}
