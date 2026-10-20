import type { Currency, ProfilePreferences, TravelType } from "@/app/lib/types";

const currencies: Currency[] = ["EUR", "USD", "GBP", "MAD"];
const travelTypes: TravelType[] = [
  "Económico", "Cultural", "Gastronómico", "Naturaleza", "Relax", "Aventura", "Familiar", "Combinado",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProfilePreferences(value: unknown): ProfilePreferences | undefined {
  if (!isRecord(value)) return undefined;
  const { name, language, currency, interests, pace, budgetPreference, travelTypes: selectedTravelTypes } = value;
  if (
    typeof name !== "string" || name.length > 160
    || typeof language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(language)
    || typeof currency !== "string" || !currencies.includes(currency as Currency)
    || !Array.isArray(interests) || interests.length > 200
    || interests.some((interest) => typeof interest !== "string" || !interest.trim() || interest.length > 80)
    || typeof pace !== "string" || !["lento", "equilibrado", "rápido"].includes(pace)
    || typeof budgetPreference !== "string" || budgetPreference.length > 80
    || !Array.isArray(selectedTravelTypes) || selectedTravelTypes.length > travelTypes.length
    || selectedTravelTypes.some((travelType) => typeof travelType !== "string" || !travelTypes.includes(travelType as TravelType))
  ) return undefined;

  return {
    name,
    language,
    currency: currency as Currency,
    interests: [...new Set(interests.map((interest) => (interest as string).trim()))],
    pace,
    budgetPreference,
    travelTypes: [...new Set(selectedTravelTypes as TravelType[])],
  };
}

export function profilePreferencesFromRow(row: unknown): ProfilePreferences | undefined {
  if (!isRecord(row)) return undefined;
  const preferences = isRecord(row.preferences) ? row.preferences : {};
  const candidate = {
    name: typeof row.display_name === "string" ? row.display_name : "",
    language: typeof row.language === "string" ? row.language : "es",
    currency: row.currency,
    interests: preferences.interests ?? [],
    pace: preferences.pace ?? "equilibrado",
    budgetPreference: preferences.budgetPreference ?? "",
    travelTypes: preferences.travelTypes ?? [],
  };
  return validateProfilePreferences(candidate);
}
