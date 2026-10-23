import "server-only";

import type { Currency, ItineraryDay, ItineraryItem } from "@/lib/types";
import { CURRENCY_CODES } from "@/lib/currency-catalog";
import { addDailySchedules } from "@/lib/itinerary-schedule";
import { getPublicEnvironment } from "@/lib/env";
import { getServerEnvironment } from "@/lib/env.server";

export interface AssistantContext {
  origin?: string;
  destination?: string;
  budget?: number;
  travelers?: number;
  interests?: string[];
  pace?: string;
  travelType?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  currency?: Currency;
  requestedDurationDays?: number;
  segmentedRequest?: boolean;
  activity?: {
    name: string;
    description?: string;
    location?: string;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
  };
}

export interface ActivityAlternative {
  name: string;
  description: string;
  durationMinutes: number;
  location?: string;
}

export interface ItineraryPlan {
  destination: string;
  durationDays: number;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  budget: {
    total: number;
    currency: Currency;
    status: "estimated" | "provided";
  };
  days: ItineraryDay[];
}

export interface AssistantReply {
  text: string;
  source: "openrouter" | "demo";
  model?: string;
  warning?: string;
  itinerary?: ItineraryPlan;
  activityAlternatives?: ActivityAlternative[];
}

export interface AssistantGenerationOptions {
  requestId?: string;
  signal?: AbortSignal;
}

export class AssistantProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AssistantProviderError";
  }
}

const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_RESPONSE_TIMEOUT_MS = 150_000;
const MAX_OUTPUT_TOKENS = 8192;
const MAX_DAYS_PER_COMPLETION = 4;
const MAX_CONTINUATIONS = 2;
const MAX_JSON_REPAIRS = 1;
const MAX_COMPLETION_LENGTH = 30_000;
const SUPPORTED_CURRENCIES: Currency[] = [...CURRENCY_CODES];
const ITINERARY_BLOCK_TYPES = ["activity", "travel", "breakfast", "lunch", "dinner", "rest", "free_time"] as const;
const SYSTEM_PROMPT =
  "Eres un asistente de viajes experto. Responde siempre en español. No inventes datos verificados, horarios actuales ni precios exactos; todo coste no confirmado debe identificarse como estimación. Mantén las respuestas concisas y bien estructuradas.";

interface OpenRouterErrorBody {
  code?: number | string;
  message?: unknown;
}

interface OpenRouterChoice {
  finish_reason?: string | null;
  message?: {
    content?: string | Array<{ type?: string; text?: string }> | null;
    refusal?: string | null;
    reasoning_content?: string | null;
  };
}

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  model?: string;
  choices?: OpenRouterChoice[];
  error?: OpenRouterErrorBody | string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

interface CompletionResult {
  text: string;
  finishReason: string | null;
  model?: string;
  httpStatus: number;
  durationMs: number;
  usage?: OpenRouterResponse["usage"];
}

type CompletionPurpose = "initial" | "continuation" | "repair";

interface GenerationTrace {
  requestId: string;
  startedAt: number;
  model?: string;
  modelCalls: number;
  repairCalls: number;
  continuationCalls: number;
  providerWaitMs: number;
  providerBodyMs: number;
  providerResponseParseMs: number;
  itineraryParseMs: number;
  validationMs: number;
  repairWaitMs: number;
  continuationWaitMs: number;
  promptCharacters: number;
  promptTokens: number;
  completionTokens: number;
  transientRetries: number;
}

function createGenerationTrace(requestId?: string): GenerationTrace {
  return {
    requestId: requestId && /^[\w-]{1,80}$/.test(requestId)
      ? requestId
      : globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now()}`,
    startedAt: Date.now(),
    modelCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    providerWaitMs: 0,
    providerBodyMs: 0,
    providerResponseParseMs: 0,
    itineraryParseMs: 0,
    validationMs: 0,
    repairWaitMs: 0,
    continuationWaitMs: 0,
    promptCharacters: 0,
    promptTokens: 0,
    completionTokens: 0,
    transientRetries: 0,
  };
}

interface JsonParseResult {
  value?: unknown;
  errors: string[];
  objectCount: number;
}

interface NormalizedItineraryResult {
  value?: ItineraryPlan;
  errors: string[];
}

function demoReply(message: string, context?: AssistantContext): AssistantReply {
  const lower = message.toLowerCase();
  const destination =
    context?.destination ??
    (lower.includes("marrakech")
      ? "Marrakech"
      : lower.includes("barcelona")
        ? "Barcelona"
        : lower.includes("budapest")
          ? "Budapest"
          : "el destino elegido");
  const travelType =
    context?.travelType ??
    (lower.includes("naturaleza") ? "naturaleza" : lower.includes("cultural") ? "cultural" : "equilibrado");
  const budget = context?.budget ?? 500;

  return {
    text: `He preparado una propuesta para ${destination} con enfoque ${travelType}. Para un presupuesto de ${budget}€ recomiendo priorizar los puntos emblemáticos, dejar margen para descanso y mantener una ruta compacta para ahorrar desplazamientos. Si quieres, puedo reordenar la agenda por gastronomía, cultura o naturaleza.`,
    source: "demo",
  };
}

function safeProviderModel(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:/-]{1,160}$/.test(value)) return undefined;
  return value;
}

function getErrorCode(error: OpenRouterResponse["error"]): number | string | undefined {
  if (error && typeof error === "object") return error.code;
  return undefined;
}

function statusFromProviderCode(value: number | string | undefined): number | undefined {
  const code = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(code) && code >= 400 && code <= 599 ? code : undefined;
}

export function mapOpenRouterError(status: number): AssistantProviderError {
  if (status === 401) return new AssistantProviderError("OpenRouter rechazó la autenticación. Revisa la configuración del proveedor.", status);
  if (status === 402) return new AssistantProviderError("OpenRouter indica que no hay créditos disponibles para esta solicitud.", status);
  if (status === 403) return new AssistantProviderError("OpenRouter bloqueó la solicitud por permisos o límites de cuenta.", status);
  if (status === 404) return new AssistantProviderError("El modelo configurado no está disponible en OpenRouter.", status);
  if (status === 429) return new AssistantProviderError("OpenRouter limitó las solicitudes. Espera un momento y vuelve a intentarlo.", status);
  if (status >= 500) return new AssistantProviderError("OpenRouter o el proveedor del modelo devolvió un error temporal.", status);
  return new AssistantProviderError(`OpenRouter rechazó la solicitud (HTTP ${status}).`, status);
}

interface OpenRouterBodyRead {
  data?: OpenRouterResponse;
  state: "valid" | "empty" | "invalid_json" | "non_object" | "read_error";
  bodyCharacters: number;
  readDurationMs: number;
  parseDurationMs: number;
}

async function readJsonResponse(response: Response): Promise<OpenRouterBodyRead> {
  const readStartedAt = Date.now();
  let body: string;
  try {
    body = await response.text();
  } catch {
    return { state: "read_error", bodyCharacters: 0, readDurationMs: Date.now() - readStartedAt, parseDurationMs: 0 };
  }

  const readDurationMs = Date.now() - readStartedAt;
  if (!body.trim()) return { state: "empty", bodyCharacters: 0, readDurationMs, parseDurationMs: 0 };

  const parseStartedAt = Date.now();
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    return {
      state: "invalid_json", bodyCharacters: body.length, readDurationMs, parseDurationMs: Date.now() - parseStartedAt,
    };
  }
  const parseDurationMs = Date.now() - parseStartedAt;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { state: "non_object", bodyCharacters: body.length, readDurationMs, parseDurationMs };
  }
  return { data: value as OpenRouterResponse, state: "valid", bodyCharacters: body.length, readDurationMs, parseDurationMs };
}

function extractText(content: string | Array<{ type?: string; text?: string }> | null | undefined): string | undefined {
  if (typeof content === "string") return content.trim() ? content : undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  return text.trim() ? text : undefined;
}

export function isItineraryRequest(message: string): boolean {
  return /\b(itinerar(?:io|ios)|planifica(?:r|me)?|organiza(?:r|me)?|prepara(?:r|me)?|plan de viaje|viaje de \d+ días|viaje por \d+ días)\b/i.test(message);
}

function requestedDaysFromMessage(message: string): number | undefined {
  const match = message.match(/\b(\d{1,2})\s*d[ií]as?\b/i);
  if (!match) return undefined;
  const days = Number(match[1]);
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days : undefined;
}

function requestedDaysFromContext(context?: AssistantContext): number | undefined {
  if (context?.startDate && context.endDate) return inclusiveDays(context.startDate, context.endDate);
  return context?.requestedDurationDays;
}

function itineraryPrompt(message: string, context?: AssistantContext): string {
  const requestedDays = requestedDaysFromContext(context) ?? requestedDaysFromMessage(message) ?? 1;
  const currency = context?.currency ?? "EUR";
  const itinerarySchema = {
    destination: "string",
    duration_days: requestedDays,
    budget: { total: "number", currency, status: "estimated | provided" },
    days: [{
      day: 1,
      title: "string",
      activities: [{
        name: "string",
        description: "string",
        type: "activity | travel | breakfast | lunch | dinner | rest | free_time",
        start_time: "HH:MM",
        end_time: "HH:MM",
        estimated_duration_minutes: "integer",
        location: "string (optional)",
        estimated_cost_per_person: "number (optional)",
        price_status: "estimate | unknown",
        budget_category: "activity | gastronomy",
        interest_tags: ["selected interest (activity only)"],
        currency,
        reliability: "estimated | unknown",
      }],
    }],
  };

  return [
    `Solicitud: ${message}`,
    `Contexto: ${JSON.stringify(context ?? {})}`,
    "Devuelve un único objeto JSON que cumpla este contrato. Sin Markdown ni texto adicional:",
    JSON.stringify(itinerarySchema),
    `Genera exactamente ${requestedDays} días consecutivos, numerados desde 1; cada día lleva título y 4 a 7 bloques breves. Cada bloque requiere nombre y duración entera de 1 a 720 minutos. Limita cada descripción a una frase de hasta 20 palabras. Si das horas, incluye ambas en formato HH:MM, en orden, sin solapamientos ni cruce de medianoche. Evita repetir actividades.`,
    "Mantén origen, destino, fechas, presupuesto, moneda, viajeros, ritmo, tipo de viaje, notas e intereses del contexto. Respeta las fechas y la duración exactas. No conviertas importes a otra moneda.",
    "Solo las visitas type=activity con budget_category=activity suman al presupuesto. Excluye vuelos, transportes, alojamiento y compras. Comidas usan breakfast/lunch/dinner y budget_category=gastronomy; desplazamientos usan travel y no suman. Omite budget_category en cualquier otro bloque.",
    "Usa español natural y nombres oficiales. No inventes aperturas, rutas, distancias, coordenadas, fuentes ni precios exactos. Para importe desconocido usa price_status=unknown y omite el importe; para estimación usa estimate y la moneda indicada. No declares precios verificados ni gratuidad verificada.",
    "Asigna interest_tags únicamente con valores exactos de los intereses del contexto y solo a visitas. Si no hay intereses o la lista está vacía, omite interest_tags o usa []. No inventes etiquetas. Si price_status=unknown, omite estimated_cost y estimated_cost_per_person (nunca uses 0 ni null). Si incluyes un precio, debe ser positivo, estar marcado estimate y usar la moneda indicada; omítelo si no puedes dar una estimación útil. No incluyas travel_minutes ni campos fuera del contrato.",
    ...(context?.segmentedRequest ? ["Este es solo el tramo indicado: no incluyas jornadas de otras fechas ni del resto del viaje."] : []),
  ].join("\n\n");
}
function scanJsonObjects(source: string): {
  values: unknown[];
  invalidCount: number;
  unclosed: boolean;
} {
  const values: unknown[] = [];
  let invalidCount = 0;
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          values.push(JSON.parse(source.slice(start, index + 1)) as unknown);
        } catch {
          invalidCount += 1;
        }
        start = -1;
      }
    }
  }
  return { values, invalidCount, unclosed: depth > 0 || inString };
}

export function parseItineraryJson(text: string): JsonParseResult {
  const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]);
  const sources = fencedBlocks.length > 0 ? [...fencedBlocks, text] : [text];
  const parsed: unknown[] = [];
  let invalidCount = 0;
  let unclosed = false;

  for (const source of sources) {
    const scan = scanJsonObjects(source);
    parsed.push(...scan.values);
    invalidCount += scan.invalidCount;
    unclosed ||= scan.unclosed;
  }

  const unique = new Map<string, unknown>();
  for (const value of parsed) {
    unique.set(JSON.stringify(value), value);
  }
  if (unique.size > 1) return { errors: ["json.multiple_objects"], objectCount: unique.size };
  if (unique.size === 1) return { value: [...unique.values()][0], errors: [], objectCount: 1 };
  if (unclosed) return { errors: ["json.truncated"], objectCount: 0 };
  if (invalidCount > 0) return { errors: ["json.invalid"], objectCount: 0 };
  return { errors: ["json.object_missing"], objectCount: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && SUPPORTED_CURRENCIES.includes(value as Currency);
}

function getProperty(record: Record<string, unknown>, primary: string, alias: string): unknown {
  return record[primary] !== undefined ? record[primary] : record[alias];
}

function validOptionalTime(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function inclusiveDays(startDate: string, endDate: string): number {
  return (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
}

function validateAndNormalizeItinerary(
  value: unknown,
  context?: AssistantContext,
): NormalizedItineraryResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ["itinerary.root"] };

  const destination = value.destination;
  const durationDays = getProperty(value, "durationDays", "duration_days");
  const budgetValue = value.budget;
  const daysValue = value.days;
  if (typeof destination !== "string" || !destination.trim()) errors.push("destination.required");
  if (typeof durationDays !== "number" || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) {
    errors.push("duration_days.range");
  }
  if (context?.requestedDurationDays !== undefined && durationDays !== context.requestedDurationDays) {
    errors.push("duration_days.requested_mismatch");
  }
  if (
    context?.startDate && context.endDate &&
    durationDays !== inclusiveDays(context.startDate, context.endDate)
  ) errors.push("duration_days.dates_mismatch");
  if (!isRecord(budgetValue)) {
    errors.push("budget.object");
  }
  if (!Array.isArray(daysValue)) {
    errors.push("days.array");
  }
  if (errors.length > 0 || !isRecord(budgetValue) || !Array.isArray(daysValue) || typeof durationDays !== "number") {
    return { errors };
  }

  const modelBudgetTotal = getProperty(budgetValue, "total", "amount");
  const budgetTotal = context?.budget ?? modelBudgetTotal;
  const budgetCurrency = context?.currency ?? budgetValue.currency;
  if (typeof budgetTotal !== "number" || !Number.isFinite(budgetTotal) || budgetTotal < 0) {
    errors.push("budget.total");
  }
  if (!isCurrency(budgetCurrency)) errors.push("budget.currency");
  if (budgetValue.status !== undefined && budgetValue.status !== "estimated" && budgetValue.status !== "provided") errors.push("budget.status");
  if (daysValue.length !== durationDays) errors.push("days.count");

  const days: ItineraryDay[] = [];
  const activityNames = new Set<string>();
  for (let index = 0; index < daysValue.length; index += 1) {
    const dayValue = daysValue[index];
    if (!isRecord(dayValue)) {
      errors.push(`days[${index}].object`);
      continue;
    }

    const dayNumber = getProperty(dayValue, "dayNumber", "day");
    const title = getProperty(dayValue, "theme", "title");
    const activitiesValue = getProperty(dayValue, "items", "activities");
    const dayDate = dayValue.date;
    if (dayNumber !== index + 1) errors.push(`days[${index}].number`);
    if (typeof title !== "string" || !title.trim()) errors.push(`days[${index}].title`);
    if (!Array.isArray(activitiesValue) || activitiesValue.length === 0 || activitiesValue.length > 12) {
      errors.push(`days[${index}].activities`);
      continue;
    }
    if (dayDate !== undefined && !isValidIsoDate(dayDate)) {
      errors.push(`days[${index}].date`);
    }
    if (typeof dayDate === "string" && context?.startDate) {
      const expectedDate = new Date(`${context.startDate}T00:00:00Z`);
      expectedDate.setUTCDate(expectedDate.getUTCDate() + index);
      if (dayDate !== expectedDate.toISOString().slice(0, 10)) {
        errors.push(`days[${index}].date_sequence`);
      }
    }

    const items: ItineraryItem[] = [];
    let previousEndMinutes = 0;
    for (let activityIndex = 0; activityIndex < activitiesValue.length; activityIndex += 1) {
      const activityValue = activitiesValue[activityIndex];
      if (!isRecord(activityValue)) {
        errors.push(`days[${index}].activities[${activityIndex}].object`);
        continue;
      }

      const name = activityValue.name;
      const description = activityValue.description;
      const duration = getProperty(activityValue, "durationMinutes", "estimated_duration_minutes");
      const estimate = activityValue.estimate !== undefined
        ? activityValue.estimate
        : activityValue.estimated_cost;
      const pricePerPerson = activityValue.pricePerPerson ?? activityValue.estimated_cost_per_person;
      const priceStatusValue = activityValue.priceStatus ?? activityValue.price_status;
      const budgetCategoryValue = activityValue.budgetCategory ?? activityValue.budget_category;
      const interestTagsValue = activityValue.interestTags ?? activityValue.interest_tags;
      const priceSourceValue = activityValue.priceSource ?? activityValue.price_source;
      const priceCheckedAtValue = activityValue.priceCheckedAt ?? activityValue.price_checked_at;
      const currency = activityValue.currency ?? budgetCurrency;
      const startTime = activityValue.startTime ?? activityValue.start_time;
      const endTime = activityValue.endTime ?? activityValue.end_time;
      const blockTypeValue = activityValue.blockType ?? activityValue.block_type ?? activityValue.type;
      const locationValue = activityValue.location ?? activityValue.place;
      const travelMinutesValue = activityValue.travelMinutes ?? activityValue.travel_minutes;
      const reliabilityValue = activityValue.reliability ?? activityValue.data_reliability;
      if (typeof name !== "string" || !name.trim()) errors.push(`days[${index}].activities[${activityIndex}].name`);
      if (typeof name === "string" && name.trim() && (blockTypeValue === undefined || blockTypeValue === "activity")) {
        const normalizedName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        if (activityNames.has(normalizedName)) errors.push(`days[${index}].activities[${activityIndex}].duplicate`);
        activityNames.add(normalizedName);
      }
      if (description !== undefined && typeof description !== "string") errors.push(`days[${index}].activities[${activityIndex}].description`);
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 1440) {
        errors.push(`days[${index}].activities[${activityIndex}].duration`);
      }
      if (estimate !== undefined && (typeof estimate !== "number" || !Number.isFinite(estimate) || estimate < 0)) {
        errors.push(`days[${index}].activities[${activityIndex}].cost`);
      }
      if (pricePerPerson !== undefined && (typeof pricePerPerson !== "number" || !Number.isFinite(pricePerPerson) || pricePerPerson <= 0)) {
        errors.push(`days[${index}].activities[${activityIndex}].price_per_person`);
      }
      if (priceStatusValue !== undefined && priceStatusValue !== "estimate" && priceStatusValue !== "unknown") {
        errors.push(`days[${index}].activities[${activityIndex}].price_status`);
      }
      if (budgetCategoryValue !== undefined && budgetCategoryValue !== "activity" && budgetCategoryValue !== "gastronomy") {
        errors.push(`days[${index}].activities[${activityIndex}].budget_category`);
      }
      const isTouristActivity = blockTypeValue === undefined || blockTypeValue === "activity";
      if (interestTagsValue !== undefined && (
        !Array.isArray(interestTagsValue) ||
        interestTagsValue.some((tag) => typeof tag !== "string" || !context?.interests?.includes(tag))
      )) errors.push(`days[${index}].activities[${activityIndex}].interest_tags`);
      if (context?.interests?.length && isTouristActivity
        && (!Array.isArray(interestTagsValue) || interestTagsValue.length === 0)) {
        errors.push(`days[${index}].activities[${activityIndex}].interest_tags_missing`);
      }
      if (priceSourceValue !== undefined || priceCheckedAtValue !== undefined) {
        errors.push(`days[${index}].activities[${activityIndex}].unverified_price_metadata`);
      }
      if (
        priceStatusValue === "unknown" &&
        (pricePerPerson !== undefined || (typeof estimate === "number" && estimate > 0))
      ) errors.push(`days[${index}].activities[${activityIndex}].unknown_price_has_amount`);
      if (priceStatusValue === "estimate" && pricePerPerson === undefined && estimate === undefined) {
        errors.push(`days[${index}].activities[${activityIndex}].estimated_price_missing`);
      }
      if (priceStatusValue === "estimate" && pricePerPerson === undefined && estimate === 0) {
        errors.push(`days[${index}].activities[${activityIndex}].zero_price_not_verified`);
      }
      if (estimate !== undefined && !isCurrency(currency)) errors.push(`days[${index}].activities[${activityIndex}].currency`);
      if (estimate !== undefined && isCurrency(currency) && isCurrency(budgetCurrency) && currency !== budgetCurrency) {
        errors.push(`days[${index}].activities[${activityIndex}].currency_mismatch`);
      }
      if (!validOptionalTime(startTime)) errors.push(`days[${index}].activities[${activityIndex}].startTime`);
      if (!validOptionalTime(endTime)) errors.push(`days[${index}].activities[${activityIndex}].endTime`);
      if ((startTime === undefined) !== (endTime === undefined)) errors.push(`days[${index}].activities[${activityIndex}].time_pair`);
      if (typeof startTime === "string" && typeof endTime === "string" && endTime <= startTime) {
        errors.push(`days[${index}].activities[${activityIndex}].time_order`);
      }
      if (typeof startTime === "string" && typeof endTime === "string") {
        const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
        const endMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
        if (endMinutes - startMinutes !== duration) errors.push(`days[${index}].activities[${activityIndex}].time_duration_mismatch`);
        if (previousEndMinutes >= 0 && startMinutes < previousEndMinutes) errors.push(`days[${index}].activities[${activityIndex}].time_overlap_or_order`);
        previousEndMinutes = Math.max(previousEndMinutes, endMinutes);
      } else {
        previousEndMinutes = -1;
      }
      if (blockTypeValue !== undefined && !ITINERARY_BLOCK_TYPES.includes(blockTypeValue as (typeof ITINERARY_BLOCK_TYPES)[number])) {
        errors.push(`days[${index}].activities[${activityIndex}].block_type`);
      }
      if (locationValue !== undefined && (typeof locationValue !== "string" || locationValue.length > 160)) {
        errors.push(`days[${index}].activities[${activityIndex}].location`);
      }
      if (travelMinutesValue !== undefined && (
        typeof travelMinutesValue !== "number" || !Number.isInteger(travelMinutesValue) || travelMinutesValue < 0 || travelMinutesValue > 720
      )) errors.push(`days[${index}].activities[${activityIndex}].travel_minutes`);
      if (reliabilityValue !== undefined && reliabilityValue !== "estimated" && reliabilityValue !== "unknown") {
        errors.push(`days[${index}].activities[${activityIndex}].reliability`);
      }
      if (typeof name !== "string" || !name.trim() || typeof duration !== "number" || !isCurrency(currency)) continue;

      const normalizedPricePerPerson = typeof pricePerPerson === "number" ? pricePerPerson : undefined;
      const normalizedEstimate = normalizedPricePerPerson !== undefined && context?.travelers !== undefined
        ? Number((normalizedPricePerPerson * context.travelers).toFixed(2))
        : typeof estimate === "number" && estimate > 0 ? estimate : undefined;
      const normalizedPriceStatus = priceStatusValue === "estimate" || priceStatusValue === "unknown"
        ? priceStatusValue
        : normalizedEstimate === undefined || normalizedEstimate === 0 ? "unknown" : "estimate";
      items.push({
        id: `ai-day-${index + 1}-item-${activityIndex + 1}`,
        name,
        description: typeof description === "string" ? description : "",
        ...(ITINERARY_BLOCK_TYPES.includes(blockTypeValue as (typeof ITINERARY_BLOCK_TYPES)[number])
          ? { blockType: blockTypeValue as ItineraryItem["blockType"] }
          : {}),
        ...(typeof locationValue === "string" ? { location: locationValue } : {}),
        ...(typeof travelMinutesValue === "number" ? { travelMinutes: travelMinutesValue } : {}),
        ...(reliabilityValue === "estimated" || reliabilityValue === "unknown" ? { reliability: reliabilityValue } : {}),
        ...(typeof startTime === "string" ? { startTime } : {}),
        ...(typeof endTime === "string" ? { endTime } : {}),
        durationMinutes: duration,
        ...(normalizedEstimate !== undefined ? { estimate: normalizedEstimate } : {}),
        ...(normalizedPricePerPerson !== undefined ? { pricePerPerson: normalizedPricePerPerson } : {}),
        priceStatus: normalizedPriceStatus,
        ...(typeof activityValue.priceSource === "string" ? { priceSource: activityValue.priceSource } : {}),
        ...(typeof activityValue.priceCheckedAt === "string" ? { priceCheckedAt: activityValue.priceCheckedAt } : {}),
        ...(Array.isArray(interestTagsValue) && interestTagsValue.every((tag): tag is string => typeof tag === "string")
          ? { interestTags: interestTagsValue }
          : {}),
        budgetCategory:
          blockTypeValue === "breakfast" || blockTypeValue === "lunch" || blockTypeValue === "dinner"
            ? "gastronomy"
            : budgetCategoryValue === "gastronomy" ? "gastronomy" : "activity",
        currency,
        order: activityIndex + 1,
        notes: estimate === undefined ? "Coste desconocido; no se ha proporcionado una estimación." : "Coste estimado, no verificado en tiempo real.",
        source: "orientativo",
      });
    }

    if (typeof title === "string" && title.trim() && dayNumber === index + 1) {
      days.push({
        id: `ai-day-${index + 1}`,
        dayNumber: index + 1,
        ...(typeof dayDate === "string"
          ? { date: dayDate }
          : context?.startDate
            ? { date: new Date(Date.parse(`${context.startDate}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10) }
            : {}),
        theme: title,
        summary: typeof dayValue.summary === "string" ? dayValue.summary : "",
        items,
      });
    }
  }

  if (errors.length > 0 || typeof destination !== "string" || typeof budgetTotal !== "number" || !isCurrency(budgetCurrency)) {
    return { errors: [...new Set(errors)] };
  }

  const scheduledDays = addDailySchedules(days);
  if (!scheduledDays) return { errors: ["schedule.capacity"] };
  return {
    value: {
      destination: typeof context?.destination === "string" ? context.destination : destination,
      durationDays,
      ...(context?.startDate ? { startDate: context.startDate } : {}),
      ...(context?.endDate ? { endDate: context.endDate } : {}),
      ...(context?.travelers !== undefined ? { travelers: context.travelers } : {}),
      budget: {
        total: budgetTotal,
        currency: budgetCurrency,
        status: context?.budget !== undefined ? "provided" : "estimated",
      },
      days: scheduledDays,
    },
    errors: [],
  };
}

export function validateItinerary(value: unknown, context?: AssistantContext): ItineraryPlan | undefined {
  return validateAndNormalizeItinerary(value, context).value;
}

function mergeContinuation(previous: string, continuation: string): string {
  const next = continuation;
  if (!next.trim()) return previous;
  const comparablePrevious = previous.trimEnd();
  if (next.trimStart().startsWith(comparablePrevious)) return next.trimStart();

  const trimmedNext = next.trimStart();
  const maxOverlap = Math.min(comparablePrevious.length, trimmedNext.length, 5000);
  for (let overlap = maxOverlap; overlap >= 8; overlap -= 1) {
    if (comparablePrevious.slice(-overlap) === trimmedNext.slice(0, overlap)) {
      return `${comparablePrevious}${trimmedNext.slice(overlap)}`;
    }
  }
  return `${previous}${next}`;
}

function normalizeForComparison(plan: ItineraryPlan): string {
  return JSON.stringify(plan);
}

function retryDelayMs(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(1000, Math.round(seconds * 1000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(1000, Math.max(0, date - Date.now()));
  }
  return 250;
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AssistantProviderError("La solicitud se canceló.", 499));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(new AssistantProviderError("La solicitud se canceló.", 499));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function requestCompletion(
  messages: OpenRouterMessage[],
  apiKey: string,
  model: string,
  trace: GenerationTrace,
  purpose: CompletionPurpose,
  signal?: AbortSignal,
  allowEmpty = false,
): Promise<CompletionResult> {
  const startedAt = Date.now();
  trace.model = model;
  if (purpose === "repair") trace.repairCalls += 1;
  if (purpose === "continuation") trace.continuationCalls += 1;
  trace.promptCharacters += messages.reduce((total, message) => total + message.content.length, 0);
  let response: Response;
  let timeoutSignal: AbortSignal | undefined;

  while (true) {
    trace.modelCalls += 1;
    const callNumber = trace.modelCalls;
    const callStartedAt = Date.now();
    try {
      timeoutSignal = AbortSignal.timeout(OPENROUTER_RESPONSE_TIMEOUT_MS);
      const requestSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
      response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": getPublicEnvironment().siteUrl ?? "http://localhost:3000",
          "X-OpenRouter-Title": "Viajes",
        },
        body: JSON.stringify({
          model,
          // Nemotron free does not enforce response_format; validate the JSON contract locally.
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          reasoning: { effort: "low", exclude: true },
          temperature: 1,
          messages,
        }),
        signal: requestSignal,
      });
    } catch (error: unknown) {
      const durationMs = Date.now() - callStartedAt;
      trace.providerWaitMs += durationMs;
      console.warn("OpenRouter completion failed", {
        requestId: trace.requestId,
        callNumber,
        purpose,
        stage: "network_request",
        model: safeProviderModel(model) ?? null,
        durationMs,
        reason: signal?.aborted ? "client_cancelled"
          : timeoutSignal?.aborted || (error instanceof Error && error.name === "TimeoutError") ? "timeout" : "network_error",
        errorType: error instanceof Error ? error.name : "unknown",
      });
      if (signal?.aborted) throw new AssistantProviderError("La solicitud se canceló.", 499);
      if (timeoutSignal?.aborted || (error instanceof Error && error.name === "TimeoutError")) {
        throw new AssistantProviderError("OpenRouter tardó demasiado en responder. Vuelve a intentarlo.", 504);
      }
      throw new AssistantProviderError("No se pudo conectar con OpenRouter. Comprueba la conexión e inténtalo de nuevo.", 503);
    }

    trace.providerWaitMs += Date.now() - callStartedAt;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && trace.transientRetries < 1 && !signal?.aborted) {
      trace.transientRetries += 1;
      const delayMs = retryDelayMs(response);
      await response.body?.cancel().catch(() => undefined);
      console.warn("OpenRouter transient response; retrying once", {
        requestId: trace.requestId,
        callNumber,
        purpose,
        stage: "provider_retry",
        httpStatus: response.status,
        delayMs,
      });
      await waitForRetry(delayMs, signal);
      continue;
    }
    break;
  }

  const bodyRead = await readJsonResponse(response);
  trace.providerBodyMs += bodyRead.readDurationMs;
  trace.providerResponseParseMs += bodyRead.parseDurationMs;
  const data = bodyRead.data;
  if (!data) {
    console.warn("OpenRouter completion failed", {
      requestId: trace.requestId,
      callNumber: trace.modelCalls,
      purpose,
      stage: "provider_response_parse",
      model: safeProviderModel(model) ?? null,
      httpStatus: response.status,
      contentType: response.headers.get("content-type")?.slice(0, 100) ?? null,
      responseBodyState: bodyRead.state,
      responseBodyCharacters: bodyRead.bodyCharacters,
      responseBodyMs: bodyRead.readDurationMs,
      responseParseMs: bodyRead.parseDurationMs,
    });
    if (!response.ok) throw mapOpenRouterError(response.status);
    if (bodyRead.state === "read_error") {
      if (signal?.aborted) throw new AssistantProviderError("La solicitud se canceló.", 499);
      if (timeoutSignal?.aborted) {
        throw new AssistantProviderError("OpenRouter tardó demasiado en completar la respuesta. Vuelve a intentarlo.", 504);
      }
      throw new AssistantProviderError("La conexión con OpenRouter se interrumpió mientras llegaba la respuesta.", 502);
    }
    throw new AssistantProviderError("OpenRouter devolvió una respuesta no válida.", 502);
  }
  const choice = data.choices?.[0];
  const text = extractText(choice?.message?.content) ?? extractText(choice?.message?.refusal) ?? "";
  if (!response.ok || data.error) {
    const providerStatus = !response.ok
      ? response.status
      : statusFromProviderCode(getErrorCode(data.error)) ?? 502;
    const providerCode = getErrorCode(data.error);
    console.warn("OpenRouter completion rejected", {
      requestId: trace.requestId,
      callNumber: trace.modelCalls,
      purpose,
      stage: "provider_error",
      model: safeProviderModel(model) ?? null,
      responseModel: safeProviderModel(data.model) ?? null,
      httpStatus: response.status,
      providerStatus,
      providerCode: typeof providerCode === "number" || (typeof providerCode === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(providerCode))
        ? providerCode
        : null,
    });
    throw mapOpenRouterError(providerStatus);
  }

  const durationMs = Date.now() - startedAt;
  if (Number.isFinite(data.usage?.prompt_tokens)) trace.promptTokens += data.usage?.prompt_tokens ?? 0;
  if (Number.isFinite(data.usage?.completion_tokens)) trace.completionTokens += data.usage?.completion_tokens ?? 0;
  if (purpose === "repair") trace.repairWaitMs += durationMs;
  if (purpose === "continuation") trace.continuationWaitMs += durationMs;
  console.info("OpenRouter completion received", {
    requestId: trace.requestId,
    callNumber: trace.modelCalls,
    purpose,
    stage: "provider_completion",
    model: safeProviderModel(model) ?? null,
    responseModel: safeProviderModel(data.model) ?? null,
    httpStatus: response.status,
    durationMs,
    responseBodyMs: bodyRead.readDurationMs,
    responseParseMs: bodyRead.parseDurationMs,
    finishReason: choice?.finish_reason ?? null,
    responseLength: text.length,
    responseEmpty: text.length === 0,
    promptTokens: Number.isFinite(data.usage?.prompt_tokens) ? data.usage?.prompt_tokens : null,
    completionTokens: Number.isFinite(data.usage?.completion_tokens) ? data.usage?.completion_tokens : null,
    totalTokens: Number.isFinite(data.usage?.total_tokens) ? data.usage?.total_tokens : null,
  });

  if (!text && choice?.finish_reason !== "length" && !allowEmpty) {
    throw new AssistantProviderError("OpenRouter no devolvió contenido para esta solicitud.", 502);
  }
  return {
    text,
    finishReason: choice?.finish_reason ?? null,
    model: typeof data.model === "string" ? data.model : model,
    httpStatus: response.status,
    durationMs,
    usage: data.usage,
  };
}
function describeValidationFailure(parse: JsonParseResult, validation: NormalizedItineraryResult): string[] {
  return parse.errors.length > 0 ? parse.errors : validation.errors;
}

function itineraryFailureWarning(errors: string[], finishReason: string | null): string {
  if (finishReason === "length" || errors.includes("json.truncated")) {
    return "La respuesta quedó incompleta por longitud; vuelve a intentarlo o reduce la duración del viaje.";
  }
  if (errors.some((error) => error.startsWith("days.count") || error.startsWith("days[") && error.includes(".number"))) {
    return "El modelo no generó todas las jornadas solicitadas en el orden esperado. Vuelve a intentarlo.";
  }
  if (errors.some((error) => error.startsWith("days[") && /time|schedule/.test(error))) {
    return "El horario devuelto contiene horas incompatibles o bloques solapados. Vuelve a intentarlo.";
  }
  if (errors.some((error) => error.startsWith("budget."))) {
    return "El presupuesto devuelto no coincide con los datos solicitados. Vuelve a intentarlo.";
  }
  if (errors.some((error) => error.startsWith("json."))) {
    return "El modelo no devolvió un único objeto JSON válido y completo. Vuelve a intentarlo.";
  }
  return "La respuesta no coincide con el esquema requerido del itinerario. Vuelve a intentarlo.";
}

function makeRepairMessage(errors: string[]): string {
  return [
    "Corrige tu respuesta anterior y devuelve de nuevo un único objeto JSON completo, sin Markdown ni texto adicional.",
    "Errores de validación:",
    ...errors.map((error) => `- ${error}`),
    "Respeta el esquema original, las claves aceptadas y el número consecutivo de días. No inventes datos; omite el coste cuando sea desconocido.",
  ].join("\n");
}

function makeContinuationMessage(): string {
  return "Continúa únicamente el objeto JSON truncado desde el último carácter, sin repetir el prefijo ni crear un segundo objeto. Completa y cierra el JSON.";
}

export async function generateTravelAssistantReply(
  message: string,
  context?: AssistantContext,
  options: AssistantGenerationOptions = {},
): Promise<AssistantReply> {
  const trace = createGenerationTrace(options.requestId);
  console.info("Assistant generation started", { requestId: trace.requestId, stage: "generation_start" });
  try {
    const reply = await generateTravelAssistantReplyInternal(message, context, trace, options.signal);
    console.info("Assistant generation completed", {
      requestId: trace.requestId,
      stage: "generation_complete",
      model: safeProviderModel(reply.model ?? trace.model) ?? null,
      durationMs: Date.now() - trace.startedAt,
      providerWaitMs: trace.providerWaitMs,
      providerBodyMs: trace.providerBodyMs,
      providerResponseParseMs: trace.providerResponseParseMs,
      itineraryParseMs: trace.itineraryParseMs,
      validationMs: trace.validationMs,
      repairWaitMs: trace.repairWaitMs,
      continuationWaitMs: trace.continuationWaitMs,
      modelCalls: trace.modelCalls,
      repairCalls: trace.repairCalls,
      continuationCalls: trace.continuationCalls,
      transientRetries: trace.transientRetries,
      promptCharacters: trace.promptCharacters,
      promptTokens: trace.promptTokens || null,
      completionTokens: trace.completionTokens || null,
      outcome: reply.itinerary ? "valid_itinerary" : reply.source,
    });
    return reply;
  } catch (error: unknown) {
    console.warn("Assistant generation failed", {
      requestId: trace.requestId,
      stage: "generation_failure",
      model: safeProviderModel(trace.model) ?? null,
      durationMs: Date.now() - trace.startedAt,
      providerWaitMs: trace.providerWaitMs,
      providerBodyMs: trace.providerBodyMs,
      providerResponseParseMs: trace.providerResponseParseMs,
      modelCalls: trace.modelCalls,
      transientRetries: trace.transientRetries,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

async function generateTravelAssistantReplyInternal(
  message: string,
  context: AssistantContext | undefined,
  trace: GenerationTrace,
  signal?: AbortSignal,
): Promise<AssistantReply> {
  const mode = getPublicEnvironment().appMode;
  if (mode === "demo") return demoReply(message, context);
  if (mode !== "production") throw new AssistantProviderError("NEXT_PUBLIC_APP_MODE debe ser demo o production.", 500);

  const serverEnvironment = getServerEnvironment();
  const provider = serverEnvironment.aiProvider ?? "openrouter";
  if (provider !== "openrouter") throw new AssistantProviderError("AI_PROVIDER debe ser openrouter para esta integración.", 500);

  const apiKey = serverEnvironment.aiApiKey;
  if (!apiKey) throw new AssistantProviderError("Falta AI_API_KEY para activar OpenRouter en modo production.", 503);
  const model = serverEnvironment.aiModel ?? DEFAULT_MODEL;
  if (context?.activity) {
    const prompt = [
      "Propón hasta tres alternativas de actividad en JSON válido, sin Markdown, con esta forma: {\"alternatives\":[{\"name\":string,\"description\":string,\"durationMinutes\":integer,\"location\":string opcional}]}.",
      "No inventes horarios de apertura, disponibilidad ni precios. Responde en español. Usa solo la información contextual necesaria.",
      `Solicitud: ${message}`,
      `Contexto: ${JSON.stringify({ destination: context.destination, date: context.startDate, interests: context.interests, restrictions: context.notes, activity: context.activity })}`,
    ].join("\n");
    const completion = await requestCompletion([
      { role: "system", content: "Eres un asistente de viajes. Devuelve únicamente JSON válido con alternativas concisas." },
      { role: "user", content: prompt },
    ], apiKey, model, trace, "initial", signal);
    const json = completion.text.match(/\{[\s\S]*\}/)?.[0];
    let alternatives: ActivityAlternative[] = [];
    if (json) {
      try {
        const parsed: unknown = JSON.parse(json);
        if (parsed && typeof parsed === "object" && "alternatives" in parsed && Array.isArray(parsed.alternatives)) {
          alternatives = parsed.alternatives.slice(0, 3).flatMap((entry): ActivityAlternative[] => {
            if (!entry || typeof entry !== "object") return [];
            const candidate = entry as Record<string, unknown>;
            if (typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 160
              || typeof candidate.description !== "string" || candidate.description.length > 1000
              || !Number.isInteger(candidate.durationMinutes) || Number(candidate.durationMinutes) < 1 || Number(candidate.durationMinutes) > 1440
              || (candidate.location !== undefined && (typeof candidate.location !== "string" || candidate.location.length > 240))) return [];
            return [{
              name: candidate.name.trim(),
              description: candidate.description.trim(),
              durationMinutes: Number(candidate.durationMinutes),
              ...(typeof candidate.location === "string" && candidate.location.trim() ? { location: candidate.location.trim() } : {}),
            }];
          });
        }
      } catch {
        alternatives = [];
      }
    }
    if (!alternatives.length) throw new AssistantProviderError("El asistente no devolvió alternativas válidas. Vuelve a intentarlo.", 502);
    return {
      text: "Estas son las alternativas propuestas. Revisa los detalles antes de sustituir la actividad.",
      source: "openrouter",
      model: completion.model ?? model,
      activityAlternatives: alternatives,
    };
  }
  const structuredItineraryRequested = isItineraryRequest(message);
  const requestedDays = requestedDaysFromContext(context) ?? requestedDaysFromMessage(message);
  if (structuredItineraryRequested && requestedDays && requestedDays > MAX_DAYS_PER_COMPLETION) {
    const partialPlans: ItineraryPlan[] = [];
    let lastModel = model;
    for (let startDay = 1; startDay <= requestedDays; startDay += MAX_DAYS_PER_COMPLETION) {
      const endDay = Math.min(startDay + MAX_DAYS_PER_COMPLETION - 1, requestedDays);
      const segmentDays = endDay - startDay + 1;
      let segmentStartDate: string | undefined;
      let segmentEndDate: string | undefined;
      if (context?.startDate) {
        const start = new Date(`${context.startDate}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() + startDay - 1);
        segmentStartDate = start.toISOString().slice(0, 10);
        const end = new Date(`${segmentStartDate}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + segmentDays - 1);
        segmentEndDate = end.toISOString().slice(0, 10);
      }
      const segmentContext: AssistantContext = {
        ...context,
        requestedDurationDays: segmentDays,
        segmentedRequest: true,
        ...(segmentStartDate ? { startDate: segmentStartDate } : {}),
        ...(segmentEndDate ? { endDate: segmentEndDate } : {}),
      };
      const previousActivityNames = partialPlans.flatMap((plan) =>
        plan.days.flatMap((day) => day.items.map((item) => item.name)),
      );
      const segmentReply = await generateTravelAssistantReplyInternal(
        `${message}\nGenera únicamente el tramo de los días ${startDay} a ${endDay} del itinerario.${
          previousActivityNames.length
            ? ` No repitas estas actividades ya asignadas a días anteriores: ${previousActivityNames.join("; ")}.`
            : ""
        }`,
        segmentContext,
        trace,
        signal,
      );
      lastModel = segmentReply.model ?? lastModel;
      if (!segmentReply.itinerary) {
        console.warn("OpenRouter itinerary segment incomplete " + JSON.stringify({
          stage: "itinerary_segment_missing",
          model: safeProviderModel(segmentReply.model) ?? safeProviderModel(model) ?? null,
          segmentStartDay: startDay,
          segmentEndDay: endDay,
          totalDays: requestedDays,
        }));
        return {
          text: "No se pudo completar el itinerario completo; se detuvo la generación para evitar mostrar un plan parcial como válido.",
          source: segmentReply.source,
          model: lastModel,
          warning: "No se generaron todas las jornadas. Vuelve a intentarlo o reduce la duración del viaje.",
        };
      }
      partialPlans.push(segmentReply.itinerary);
    }

    const combined = {
      destination: context?.destination ?? partialPlans[0].destination,
      duration_days: requestedDays,
      budget: partialPlans[0].budget,
      days: partialPlans.flatMap((plan) => plan.days).map((day, index) => ({
        ...day,
        id: `ai-day-${index + 1}`,
        dayNumber: index + 1,
        ...(context?.startDate
          ? {
              date: new Date(Date.parse(`${context.startDate}T00:00:00Z`) + index * 86_400_000)
                .toISOString()
                .slice(0, 10),
            }
          : {}),
        items: day.items.map((item, itemIndex) => ({
          ...item,
          id: `ai-day-${index + 1}-item-${itemIndex + 1}`,
          order: itemIndex + 1,
        })),
      })),
    };
    const combinedValidationStartedAt = Date.now();
    const combinedValidation = validateAndNormalizeItinerary(combined, context);
    trace.validationMs += Date.now() - combinedValidationStartedAt;
    const plan = combinedValidation.value;
    if (!plan || plan.days.length !== requestedDays) {
      console.warn("OpenRouter segmented itinerary validation failed " + JSON.stringify({
        stage: "itinerary_segment_validation",
        model: safeProviderModel(lastModel) ?? null,
        expectedDays: requestedDays,
        receivedDays: combined.days.length,
        validationErrors: combinedValidation.errors,
      }));
      return {
        text: "No se pudo validar el itinerario completo. No se han mostrado jornadas parciales.",
        source: "openrouter",
        model: lastModel,
        warning: "La respuesta combinada no superó la validación del itinerario. Vuelve a intentarlo.",
      };
    }
    return {
      text: `Itinerario para ${plan.destination} · ${plan.durationDays} días.`,
      source: "openrouter",
      model: lastModel,
      itinerary: plan,
    };
  }
  const userContent = structuredItineraryRequested
    ? itineraryPrompt(message, context)
    : [`Solicitud del viajero: ${message}`, `Contexto disponible: ${JSON.stringify(context ?? {})}`].join("\n");
  const baseMessages: OpenRouterMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
  let messages = [...baseMessages];

  let completion = await requestCompletion(messages, apiKey, model, trace, "initial", signal);
  if (!structuredItineraryRequested) {
    let combinedText = completion.text;
    let continuations = 0;
    while (completion.finishReason === "length" && continuations < MAX_CONTINUATIONS) {
      if (combinedText.length > MAX_COMPLETION_LENGTH) break;
      messages.push(
        { role: "assistant", content: combinedText },
        { role: "user", content: "Continúa la respuesta desde donde se cortó, sin repetir texto anterior." },
      );
      completion = await requestCompletion(messages, apiKey, model, trace, "continuation", signal);
      combinedText = mergeContinuation(combinedText, completion.text);
      continuations += 1;
    }
    return {
      text: combinedText.trim(),
      source: "openrouter",
      model: completion.model ?? model,
      ...(completion.finishReason === "length"
        ? { warning: "La respuesta quedó truncada tras los intentos de continuación disponibles. Vuelve a intentarlo con una petición más breve." }
        : {}),
    };
  }

  let responseText = completion.text;
  let continuationCount = 0;
  let repairCount = 0;
  let lastValidationErrors: string[] = [];
  let lastParseErrors: string[] = [];
  let lastJsonExtracted = false;
  let rejectNextParsedResponse = false;
  const continuationLimit = context?.segmentedRequest ? 1 : MAX_CONTINUATIONS;
  const repairLimit = context?.segmentedRequest ? 1 : MAX_JSON_REPAIRS;

  while (responseText.length <= MAX_COMPLETION_LENGTH) {
    const parseStartedAt = Date.now();
    const parsed = parseItineraryJson(responseText);
    const parseDurationMs = Date.now() - parseStartedAt;
    trace.itineraryParseMs += parseDurationMs;
    const validationStartedAt = Date.now();
    const validation = rejectNextParsedResponse
      ? { errors: ["json.multiple_distinct_itineraries"] }
      : parsed.value === undefined
      ? { errors: parsed.errors }
      : validateAndNormalizeItinerary(parsed.value, context);
    const validationDurationMs = Date.now() - validationStartedAt;
    trace.validationMs += validationDurationMs;
    rejectNextParsedResponse = false;
    const plan = validation.value;
    lastParseErrors = parsed.errors;
    lastJsonExtracted = parsed.value !== undefined;
    const candidateErrors = validation.value ? [] : describeValidationFailure(parsed, validation);
    console.info("Assistant itinerary candidate processed", {
      requestId: trace.requestId,
      stage: "itinerary_parse_validation",
      parseDurationMs,
      validationDurationMs,
      jsonExtracted: parsed.value !== undefined,
      outcome: validation.value ? "valid" : "invalid",
      errorCodes: candidateErrors,
    });

    if (plan && completion.finishReason !== "length") {
      return {
        text: `Itinerario para ${plan.destination} · ${plan.durationDays} días.`,
        source: "openrouter",
        model: completion.model ?? model,
        itinerary: plan,
      };
    }

    lastValidationErrors = plan ? ["response.truncated"] : describeValidationFailure(parsed, validation);
    if (completion.finishReason === "length" && continuationCount < continuationLimit) {
      messages.push(
        { role: "assistant", content: responseText },
        { role: "user", content: makeContinuationMessage() },
      );
      const nextCompletion = await requestCompletion(messages, apiKey, model, trace, "continuation", signal, true);

      if (nextCompletion.text) {
        const nextParseStartedAt = Date.now();
        const nextParsed = parseItineraryJson(nextCompletion.text);
        trace.itineraryParseMs += Date.now() - nextParseStartedAt;
        const nextValidationStartedAt = Date.now();
        const nextValidation = nextParsed.value === undefined
          ? { errors: nextParsed.errors }
          : validateAndNormalizeItinerary(nextParsed.value, context);
        trace.validationMs += Date.now() - nextValidationStartedAt;

        if (nextValidation.value) {
          if (plan && normalizeForComparison(plan) !== normalizeForComparison(nextValidation.value)) {
            lastValidationErrors = ["json.multiple_distinct_itineraries"];
            completion = nextCompletion;
            responseText = nextCompletion.text;
            rejectNextParsedResponse = true;
          } else {
            responseText = nextCompletion.text;
            completion = nextCompletion;
            continuationCount += 1;
            continue;
          }
        } else {
          responseText = mergeContinuation(responseText, nextCompletion.text);
          completion = nextCompletion;
        }
      } else {
        responseText = nextCompletion.text;
        completion = nextCompletion;
      }
      continuationCount += 1;
      continue;
    }

    if (repairCount < repairLimit && (!context?.segmentedRequest || continuationCount === 0)) {
      messages = [
        ...baseMessages,
        { role: "user", content: makeRepairMessage(lastValidationErrors) },
      ];
      completion = await requestCompletion(messages, apiKey, model, trace, "repair", signal, true);
      responseText = completion.text;
      repairCount += 1;
      rejectNextParsedResponse = false;
      continue;
    }
    break;
  }

  console.warn("OpenRouter itinerary validation failed " + JSON.stringify({
    stage: "itinerary_validation",
    model: safeProviderModel(completion.model) ?? safeProviderModel(model) ?? null,
    httpStatus: completion.httpStatus,
    durationMs: completion.durationMs,
    responseModel: safeProviderModel(completion.model) ?? null,
    finishReason: completion.finishReason === "length" ? "length" : "other",
    promptTokens: Number.isFinite(completion.usage?.prompt_tokens) ? completion.usage?.prompt_tokens : null,
    completionTokens: Number.isFinite(completion.usage?.completion_tokens) ? completion.usage?.completion_tokens : null,
    totalTokens: Number.isFinite(completion.usage?.total_tokens) ? completion.usage?.total_tokens : null,
    responseLength: Math.min(responseText.length, MAX_COMPLETION_LENGTH),
    textReceived: responseText.length > 0,
    jsonExtracted: lastJsonExtracted,
    parseErrors: lastParseErrors,
    validationErrors: lastValidationErrors,
    continuationCount,
    repairCount,
  }));
  return {
    text: "No se pudo completar un itinerario válido. Comprueba la solicitud y vuelve a intentarlo.",
    source: "openrouter",
    model: completion.model ?? model,
    warning: itineraryFailureWarning(lastValidationErrors, completion.finishReason),
  };
}
