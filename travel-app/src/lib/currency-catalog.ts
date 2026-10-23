export const CURRENCY_OPTIONS = [
  { code: "EUR", name: "Euro" },
  { code: "MAD", name: "Dirham marroquí" },
  { code: "COP", name: "Peso colombiano" },
  { code: "USD", name: "Dólar estadounidense" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "CHF", name: "Franco suizo" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "ARS", name: "Peso argentino" },
  { code: "CLP", name: "Peso chileno" },
  { code: "PEN", name: "Sol peruano" },
  { code: "BRL", name: "Real brasileño" },
  { code: "CAD", name: "Dólar canadiense" },
  { code: "AUD", name: "Dólar australiano" },
  { code: "JPY", name: "Yen japonés" },
] as const;

export type Currency = (typeof CURRENCY_OPTIONS)[number]["code"];
export const CURRENCY_CODES = CURRENCY_OPTIONS.map(({ code }) => code);

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && CURRENCY_OPTIONS.some(({ code }) => code === value);
}

export function currencyFractionDigits(currency: Currency): number {
  return currency === "JPY" || currency === "CLP" ? 0 : 2;
}
