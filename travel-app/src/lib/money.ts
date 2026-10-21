import type { Currency } from "@/lib/types";

export function formatMoney(amount: number, currency: Currency, locale = "es-ES"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
