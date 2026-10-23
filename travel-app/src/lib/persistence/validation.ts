import type { TripDraft } from "@/lib/persistence/types";
import type { Currency, ItineraryItem, TripStatus, TravelType } from "@/lib/types";
import { isCurrency } from "@/lib/currency-catalog";
import { durationBetween } from "@/lib/itinerary-schedule";

const travelTypes: TravelType[] = [
  "Económico", "Cultural", "Gastronómico", "Naturaleza", "Relax", "Aventura", "Familiar", "Combinado",
];
const tripStatuses: TripStatus[] = ["borrador", "planificado", "activo", "completado"];
const itineraryBlockTypes = ["activity", "travel", "breakfast", "lunch", "dinner", "rest", "free_time"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validActivity(value: unknown, travelers: number, tripInterests: string[]): value is ItineraryItem {
  if (!isRecord(value)) return false;
  const priceStatus = value.priceStatus;
  const pricePerPerson = value.pricePerPerson;
  const estimate = value.estimate;
  const interestTags = value.interestTags;
  return typeof value.id === "string"
    && typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 200
    && typeof value.description === "string" && value.description.length <= 2000
    && (value.blockType === undefined || itineraryBlockTypes.includes(String(value.blockType)))
    && (value.location === undefined || (typeof value.location === "string" && value.location.length <= 160))
    && (value.travelMinutes === undefined || (typeof value.travelMinutes === "number" && Number.isInteger(value.travelMinutes) && value.travelMinutes >= 0 && value.travelMinutes <= 720))
    && (value.reliability === undefined || value.reliability === "verified" || value.reliability === "estimated" || value.reliability === "unknown")
    && (value.startTime === undefined || (typeof value.startTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime)))
    && (value.endTime === undefined || (typeof value.endTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime)))
    && typeof value.durationMinutes === "number" && Number.isInteger(value.durationMinutes) && value.durationMinutes >= 1 && value.durationMinutes <= 1440
    && (estimate === undefined || (typeof estimate === "number" && Number.isFinite(estimate) && estimate >= 0))
    && (pricePerPerson === undefined || (typeof pricePerPerson === "number" && Number.isFinite(pricePerPerson) && pricePerPerson > 0))
    && (priceStatus === undefined || priceStatus === "estimate" || priceStatus === "unknown" || priceStatus === "verified" || priceStatus === "free_verified")
    && (priceStatus !== "unknown" || ((estimate === undefined || estimate === 0) && pricePerPerson === undefined))
    && (priceStatus !== "estimate" && priceStatus !== "verified" || (estimate !== undefined && estimate > 0) || pricePerPerson !== undefined)
    && (priceStatus !== "free_verified" || ((estimate === undefined || estimate === 0) && pricePerPerson === undefined))
    && (value.priceSource === undefined && value.priceCheckedAt === undefined)
    && (value.budgetCategory === undefined || value.budgetCategory === "activity" || value.budgetCategory === "gastronomy")
    && (interestTags === undefined || (Array.isArray(interestTags) && interestTags.length <= 200 && interestTags.every((tag) => typeof tag === "string" && tag.length <= 80 && tripInterests.includes(tag))))
    && (pricePerPerson === undefined || estimate === Number((pricePerPerson * travelers).toFixed(2)))
    && isCurrency(value.currency)
    && typeof value.order === "number" && Number.isInteger(value.order) && value.order > 0
    && typeof value.notes === "string" && value.notes.length <= 2000
    && ["verificado", "orientativo", "desconocido"].includes(String(value.source))
    && (value.lat === undefined || (typeof value.lat === "number" && value.lat >= -90 && value.lat <= 90))
    && (value.lng === undefined || (typeof value.lng === "number" && value.lng >= -180 && value.lng <= 180));
}

export function validateTripDraft(value: unknown): TripDraft | undefined {
  if (!isRecord(value)) return undefined;
  const {
    name,
    origin,
    destination,
    startDate,
    endDate,
    travelers,
    budget,
    currency,
    interests,
    travelType,
    status,
    itinerary,
  } = value;
  if (
    typeof name !== "string" || !name.trim() || name.length > 160
    || (origin !== undefined && (typeof origin !== "string" || origin.length > 160))
    || typeof destination !== "string" || !destination.trim() || destination.length > 160
    || (startDate !== undefined && startDate !== null && !isDate(startDate))
    || (endDate !== undefined && endDate !== null && !isDate(endDate))
    || (typeof startDate === "string" && typeof endDate === "string" && endDate < startDate)
    || (travelers !== undefined && (typeof travelers !== "number" || !Number.isInteger(travelers) || travelers < 1 || travelers > 100))
    || typeof budget !== "number" || !Number.isFinite(budget) || budget < 0
    || !isCurrency(currency)
    || (interests !== undefined && (!Array.isArray(interests) || interests.length > 200 || interests.some((item) => typeof item !== "string" || item.length > 80)))
    || (travelType !== undefined && (typeof travelType !== "string" || !travelTypes.includes(travelType as TravelType)))
    || (status !== undefined && (typeof status !== "string" || !tripStatuses.includes(status as TripStatus)))
    || !Array.isArray(itinerary) || itinerary.length < 1 || itinerary.length > 30
  ) {
    return undefined;
  }

  const validDays = itinerary.every((day, index) => {
    if (!isRecord(day) || day.dayNumber !== index + 1 || typeof day.theme !== "string" || !day.theme.trim() || day.theme.length > 160) {
      return false;
    }
    if (
      (day.date !== undefined && !isDate(day.date))
      || (day.summary !== undefined && (typeof day.summary !== "string" || day.summary.length > 2000))
      || !Array.isArray(day.items) || day.items.length > 12
    ) return false;
    const validActivities = day.items.every((activity) => validActivity(
      activity,
      typeof travelers === "number" ? travelers : 1,
      Array.isArray(interests) ? interests as string[] : [],
    ));
    if (!validActivities) return false;
    const timed = day.items.filter((activity): activity is ItineraryItem =>
      isRecord(activity) && typeof activity.startTime === "string" && typeof activity.endTime === "string",
    );
    if (timed.length > 0 && timed.length === day.items.length) {
      const sorted = [...timed].sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)));
      let previousEnd = 0;
      for (const activity of sorted) {
        const start = Number(activity.startTime?.slice(0, 2)) * 60 + Number(activity.startTime?.slice(3, 5));
        const end = Number(activity.endTime?.slice(0, 2)) * 60 + Number(activity.endTime?.slice(3, 5));
        if (start < previousEnd || end - start !== activity.durationMinutes) return false;
        previousEnd = end;
      }
    }
    return true;
  });
  if (
    typeof startDate === "string" && typeof endDate === "string"
    && itinerary.length !== (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1
  ) return undefined;
  if (typeof startDate === "string" && itinerary.some((day, index) => {
    if (!isRecord(day) || typeof day.date !== "string") return false;
    return day.date !== new Date(Date.parse(`${startDate}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
  })) return undefined;
  if (!validDays) return undefined;
  return value as unknown as TripDraft;
}

export function validateExpense(value: unknown): {
  category: string;
  description: string;
  amount: number;
  currency: Currency;
  incurredOn: string;
  notes?: string;
  activityId?: string;
} | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.category !== "string" || !value.category.trim() || value.category.length > 80
    || typeof value.description !== "string" || !value.description.trim() || value.description.length > 240
    || typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0
    || !isCurrency(value.currency)
    || !isDate(value.incurredOn)
    || (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 1000))
    || (value.activityId !== undefined && (typeof value.activityId !== "string" || value.activityId.length > 100))
  ) return undefined;
  return {
    category: value.category.trim(),
    description: value.description.trim(),
    amount: value.amount,
    currency: value.currency as Currency,
    incurredOn: value.incurredOn,
    ...(typeof value.notes === "string" ? { notes: value.notes } : {}),
    ...(typeof value.activityId === "string" && value.activityId ? { activityId: value.activityId } : {}),
  };
}

export function validateActivityUpdate(value: unknown): Partial<ItineraryItem> | undefined {
  if (!isRecord(value)) return undefined;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = value.description;
  const durationMinutes = value.durationMinutes;
  const estimate = value.estimate;
  const pricePerPerson = value.pricePerPerson;
  const priceStatus = value.priceStatus;
  const blockType = value.blockType;
  const startTime = value.startTime;
  const lat = value.lat;
  const lng = value.lng;
  const location = value.location;
  const travelMinutes = value.travelMinutes;
  const reliability = value.reliability;
  if (
    !name || name.length > 200
    || typeof description !== "string" || description.length > 2000
    || typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440
    || (estimate !== undefined && (typeof estimate !== "number" || !Number.isFinite(estimate) || estimate < 0))
    || (pricePerPerson !== undefined && (typeof pricePerPerson !== "number" || !Number.isFinite(pricePerPerson) || pricePerPerson <= 0))
    || (priceStatus !== undefined && priceStatus !== "estimate" && priceStatus !== "unknown" && priceStatus !== "verified" && priceStatus !== "free_verified")
    || (priceStatus === "unknown" && ((estimate !== undefined && estimate !== 0) || pricePerPerson !== undefined))
    || ((priceStatus === "estimate" || priceStatus === "verified") && ((estimate === undefined || estimate <= 0) && pricePerPerson === undefined))
    || (priceStatus === "free_verified" && ((estimate !== undefined && estimate !== 0) || pricePerPerson !== undefined))
    || (startTime !== undefined && (typeof startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)))
    || (lat !== undefined && (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90))
    || (lng !== undefined && (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180))
    || ((lat === undefined) !== (lng === undefined))
    || (blockType !== undefined && !itineraryBlockTypes.includes(String(blockType)))
    || (location !== undefined && (typeof location !== "string" || location.length > 160))
    || (travelMinutes !== undefined && (typeof travelMinutes !== "number" || !Number.isInteger(travelMinutes) || travelMinutes < 0 || travelMinutes > 720))
    || (reliability !== undefined && reliability !== "verified" && reliability !== "estimated" && reliability !== "unknown")
  ) return undefined;
  return {
    name,
    description,
    durationMinutes,
    ...(typeof startTime === "string" ? { startTime } : {}),
    ...(typeof lat === "number" ? { lat } : {}),
    ...(typeof lng === "number" ? { lng } : {}),
    ...(typeof estimate === "number" ? { estimate } : {}),
    ...(typeof pricePerPerson === "number" ? { pricePerPerson } : {}),
    ...(priceStatus === "estimate" || priceStatus === "unknown" || priceStatus === "verified" || priceStatus === "free_verified" ? { priceStatus } : {}),
    ...(blockType !== undefined ? { blockType: blockType as ItineraryItem["blockType"] } : {}),
    ...(typeof location === "string" ? { location } : {}),
    ...(typeof travelMinutes === "number" ? { travelMinutes } : {}),
    ...(reliability === "verified" || reliability === "estimated" || reliability === "unknown" ? { reliability } : {}),
  };
}

export function validateActivityCreate(value: unknown): {
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  location?: string;
  blockType: NonNullable<ItineraryItem["blockType"]>;
} | undefined {
  if (!isRecord(value)) return undefined;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = value.description;
  const startTime = value.startTime;
  const endTime = value.endTime;
  const durationMinutes = value.durationMinutes;
  const location = value.location;
  const blockType = value.blockType;
  const supportedBlockTypes: NonNullable<ItineraryItem["blockType"]>[] = [
    "activity", "travel", "breakfast", "lunch", "dinner", "rest", "free_time",
  ];
  if (!name || name.length > 200
    || typeof description !== "string" || description.length > 2000
    || typeof startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    || typeof endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)
    || durationBetween(startTime, endTime) !== durationMinutes
    || typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440
    || (location !== undefined && (typeof location !== "string" || location.length > 160))
    || (blockType !== undefined && !supportedBlockTypes.includes(blockType as NonNullable<ItineraryItem["blockType"]>))) return undefined;
  return {
    name,
    description,
    startTime,
    endTime,
    durationMinutes,
    ...(typeof location === "string" && location.trim() ? { location: location.trim() } : {}),
    blockType: (blockType ?? "activity") as NonNullable<ItineraryItem["blockType"]>,
  };
}
