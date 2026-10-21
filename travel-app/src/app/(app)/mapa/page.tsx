import { TripMapClient } from "@/features/map/components/trip-map-client";
import { PageHeading } from "@/components/ui";

export default function MapaPage() {
  return (
    <main className="map-page mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 2xl:px-10">
      <PageHeading eyebrow="Explora tus planes" title="Mapa de viaje" description="Ubicaciones basadas en actividades guardadas, sin inventar rutas ni trayectos." />

      <TripMapClient />
    </main>
  );
}
