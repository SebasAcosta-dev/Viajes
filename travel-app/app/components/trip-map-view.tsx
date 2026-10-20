"use client";

import { divIcon, latLngBounds, type LatLngTuple } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";

export interface TripMapPoint {
  id: string;
  name: string;
  description: string;
  location?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  lat: number;
  lng: number;
  reliability?: string;
}

function pointIcon(number: number, selected: boolean) {
  return divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:3px solid white;border-radius:50%;background:${selected ? "#047857" : "#0f172a"};color:white;font-weight:700;box-shadow:0 2px 8px #0005">${number}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function MapFocus({ points, selected }: { points: TripMapPoint[]; selected?: TripMapPoint }) {
  const map = useMap();
  const positions = useMemo(
    () => points.map((point) => [point.lat, point.lng] as LatLngTuple),
    [points],
  );
  useEffect(() => {
    if (selected) {
      map.setView([selected.lat, selected.lng], 15);
    } else if (positions.length === 1) {
      map.setView(positions[0], 13);
    } else if (positions.length > 1) {
      map.fitBounds(latLngBounds(positions), { padding: [32, 32], maxZoom: 14 });
    }
  }, [map, positions, selected]);
  return null;
}

export function TripMapView({
  points,
  selectedId,
  onSelect,
}: {
  points: TripMapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = points.find((point) => point.id === selectedId);
  const center: LatLngTuple = points[0] ? [points[0].lat, points[0].lng] : [20, 0];

  return (
    <MapContainer center={center} zoom={2} scrollWheelZoom className="h-[55vh] min-h-80 w-full rounded-2xl sm:h-[65vh]">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapFocus points={points} selected={selected} />
      {points.map((point, index) => (
        <Marker
          key={point.id}
          position={[point.lat, point.lng]}
          icon={pointIcon(index + 1, selectedId === point.id)}
          eventHandlers={{ click: () => onSelect(point.id) }}
        >
          <Popup>
            <strong>{point.startTime ? `${point.startTime} · ` : ""}{point.name}</strong>
            <br />{point.location || point.date}
            {point.endTime && <><br />Fin: {point.endTime}</>}
            <br />Duración: {point.durationMinutes} min
            {point.description && <><br />{point.description}</>}
            <br />Fiabilidad de ubicación: {point.reliability ?? "no indicada"}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
