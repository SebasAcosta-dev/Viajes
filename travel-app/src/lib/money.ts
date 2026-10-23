import type { Currency } from "@/lib/types";
import { CURRENCY_CODES, currencyFractionDigits } from "@/lib/currency-catalog";

const MONEY_CURRENCIES = new Set<Currency>(CURRENCY_CODES);

export type MinorUnits = number & { readonly __minorUnits: unique symbol };

export function requireCurrency(value: string): Currency {
  if (!MONEY_CURRENCIES.has(value as Currency)) throw new RangeError("La moneda no está admitida.");
  return value as Currency;
}

function decimalToMinorUnits(amount: number, fractionDigits: number): number {
  if (!Number.isFinite(amount)) throw new RangeError("El importe debe ser un número finito.");
  const value = amount.toString();
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) throw new RangeError("El importe no tiene un formato decimal válido.");

  const sign = match[1] === "-" ? -1 : 1;
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  const digits = `${match[2]}${fraction}`.replace(/^0+(?=\d)/, "");
  const shift = exponent - fraction.length + fractionDigits;
  let absoluteMinorUnits: number;
  if (shift >= 0) {
    const expanded = `${digits}${"0".repeat(shift)}`;
    absoluteMinorUnits = Number(expanded);
  } else {
    const places = -shift;
    const splitAt = Math.max(0, digits.length - places);
    const whole = digits.slice(0, splitAt) || "0";
    const discarded = `${"0".repeat(Math.max(0, places - digits.length))}${digits.slice(splitAt)}`;
    absoluteMinorUnits = Number(whole) + (discarded[0] >= "5" ? 1 : 0);
  }

  const result = sign * absoluteMinorUnits;
  if (!Number.isSafeInteger(result)) throw new RangeError("El importe excede el límite admitido.");
  return result;
}

export function toMinorUnits(amount: number, currency: Currency): MinorUnits {
  if (!MONEY_CURRENCIES.has(currency)) throw new RangeError("La moneda no está admitida.");
  if (amount < 0) throw new RangeError("El importe no puede ser negativo.");
  return decimalToMinorUnits(amount, currencyFractionDigits(currency)) as MinorUnits;
}

export function fromMinorUnits(amount: number, currency: Currency): number {
  if (!MONEY_CURRENCIES.has(currency)) throw new RangeError("La moneda no está admitida.");
  if (!Number.isSafeInteger(amount)) throw new RangeError("El importe en unidades menores no es válido.");
  return amount / (10 ** currencyFractionDigits(currency));
}

export function addMinorUnits(left: MinorUnits, right: MinorUnits): MinorUnits {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) throw new RangeError("La suma excede el límite admitido.");
  return sum as MinorUnits;
}

export function sumMinorUnitsForCurrency<T extends { amount: number; currency: Currency }>(
  values: readonly T[],
  currency: Currency,
): MinorUnits {
  return values.reduce((sum, value) => value.currency === currency
    ? addMinorUnits(sum, toMinorUnits(value.amount, currency))
    : sum, 0 as MinorUnits);
}

export function sumAmountsInMinorUnits(amounts: readonly number[], currency: Currency): number {
  const total = amounts.reduce<MinorUnits>((sum, amount) => addMinorUnits(sum, toMinorUnits(amount, currency)), 0 as MinorUnits);
  return fromMinorUnits(total, currency);
}

export function formatMoney(amount: number, currency: Currency, locale = "es-ES"): string {
  const fractionDigits = currencyFractionDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
