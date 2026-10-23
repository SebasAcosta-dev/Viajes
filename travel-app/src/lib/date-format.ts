export function formatIsoDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Fechas pendientes";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatTripPeriod(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate && !endDate) return "Fechas pendientes";
  if (!startDate) return `Regreso: ${formatIsoDate(endDate)}`;
  if (!endDate) return `Salida: ${formatIsoDate(startDate)}`;
  return `${formatIsoDate(startDate)} – ${formatIsoDate(endDate)}`;
}

export function addIsoDays(value: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isInteger(days)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
