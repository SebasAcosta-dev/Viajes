import type { Currency, ItineraryDay, ItineraryItem } from "@/lib/types";
import { addDailySchedules } from "@/lib/itinerary-schedule";

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

const DEFAULT_MODEL = "minimax/minimax-m3.1-flash:free";
const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_OUTPUT_TOKENS = 8192;
const MAX_DAYS_PER_COMPLETION = 4;
const MAX_CONTINUATIONS = 2;
const MAX_JSON_REPAIRS = 2;
const MAX_COMPLETION_LENGTH = 30_000;
const SUPPORTED_CURRENCIES: Currency[] = ["EUR", "USD", "GBP", "MAD"];
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
  usage?: OpenRouterResponse["usage"];
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

function safeProviderMessage(value: unknown, apiKey: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const safe = value
    .replaceAll(apiKey, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return safe || undefined;
}

function safeProviderModel(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:/-]{1,160}$/.test(value)) return undefined;
  return value;
}

function getErrorMessage(error: OpenRouterResponse["error"]): unknown {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") return error.message;
  return undefined;
}

function getErrorCode(error: OpenRouterResponse["error"]): number | string | undefined {
  if (error && typeof error === "object") return error.code;
  return undefined;
}

function statusFromProviderCode(value: number | string | undefined): number | undefined {
  const code = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(code) && code >= 400 && code <= 599 ? code : undefined;
}

export function mapOpenRouterError(status: number, providerMessage?: string): AssistantProviderError {
  const details = providerMessage ? ` Detalle: ${providerMessage}` : "";
  if (status === 401) return new AssistantProviderError(`OpenRouter rechazó la autenticación. Revisa AI_API_KEY.${details}`, status);
  if (status === 402) return new AssistantProviderError(`OpenRouter indica saldo o créditos insuficientes.${details}`, status);
  if (status === 403) return new AssistantProviderError(`OpenRouter bloqueó la solicitud por permisos, límites de gasto o configuración de la cuenta.${details}`, status);
  if (status === 404) return new AssistantProviderError(`El modelo o la ruta no están disponibles en OpenRouter. Revisa AI_MODEL.${details}`, status);
  if (status === 429) return new AssistantProviderError(`OpenRouter limitó las solicitudes. Espera un momento y vuelve a intentarlo.${details}`, status);
  if (status >= 500) return new AssistantProviderError(`OpenRouter o el proveedor del modelo devolvió un error temporal.${details}`, status);
  return new AssistantProviderError(`OpenRouter rechazó la solicitud (HTTP ${status}).${details}`, status);
}

async function readJsonResponse(response: Response): Promise<OpenRouterResponse | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as OpenRouterResponse;
    }
  } catch {
    return undefined;
  }
  return undefined;
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
    destination: context?.destination ?? "Destino",
    duration_days: requestedDays,
    budget: { total: context?.budget ?? 0, currency, status: "estimated" },
    days: Array.from({ length: requestedDays }, (_, index) => ({
      day: index + 1,
      title: `Título del día ${index + 1}`,
      activities: [
        {
          name: "Desayuno libre",
          description: "Pausa para desayunar, sin recomendar un establecimiento.",
          type: "breakfast",
          start_time: "09:00",
          end_time: "09:45",
          estimated_duration_minutes: 45,
          price_status: "unknown",
          budget_category: "gastronomy",
          currency,
          reliability: "estimated",
        },
        {
          name: "Visita",
          description: "Actividad orientativa.",
          type: "activity",
          start_time: "10:00",
          end_time: "11:30",
          estimated_duration_minutes: 90,
          price_status: "unknown",
          budget_category: "activity",
          interest_tags: context?.interests?.length ? [context.interests[0]] : [],
          currency,
          reliability: "unknown",
        },
        {
          name: "Tiempo para almorzar",
          description: "Pausa flexible para comer.",
          type: "lunch",
          start_time: "13:00",
          end_time: "14:00",
          estimated_duration_minutes: 60,
          price_status: "unknown",
          budget_category: "gastronomy",
          currency,
          reliability: "estimated",
        },
        {
          name: "Cena libre",
          description: "Pausa flexible para cenar.",
          type: "dinner",
          start_time: "19:00",
          end_time: "20:00",
          estimated_duration_minutes: 60,
          price_status: "unknown",
          budget_category: "gastronomy",
          currency,
          reliability: "estimated",
        },
      ],
    })),
  };
  return [
    `Solicitud del viajero: ${message}`,
    `Contexto disponible: ${JSON.stringify(context ?? {})}`,
    "Devuelve exclusivamente un objeto JSON válido que cumpla este esquema, sin Markdown ni texto antes/después:",
    JSON.stringify(itinerarySchema),
    "Para cada jornada, activities contiene bloques horarios. Cada bloque admite name, description, type (activity, travel, breakfast, lunch, dinner, rest, free_time), start_time, end_time, estimated_duration_minutes, location, travel_minutes, estimated_cost_per_person, price_status (estimate o unknown), budget_category (activity o gastronomy), interest_tags, currency y reliability (estimated o unknown).",
    "Organiza una propuesta cronológica orientativa entre 09:00 y 21:00. Incluye desayuno alrededor de 09:00, tiempo para almorzar entre 13:00–14:30 y cena entre 19:00–20:30; puedes adaptar sus nombres/tiempos a costumbres locales solo si hay base fiable. Incluye descansos o tiempo libre cuando sea apropiado, sin llenar huecos artificialmente. No asignes establecimientos concretos sin datos fiables.",
    "No hay acceso garantizado a rutas, tiempos de trayecto, aperturas ni precios en tiempo real. No inventes distancias, coordenadas, horarios de apertura ni fuentes. Solo incluye desplazamientos cuando exista una base explícita y marca su fiabilidad; los horarios propuestos y datos no verificados son estimaciones. Agrupa por proximidad solo cuando existan datos confiables; si no, organiza una secuencia lógica y señala la limitación.",
    "Escribe en español natural, sin mezclar idiomas salvo nombres oficiales propios. Conserva los nombres oficiales de lugares. Propón actividades coherentes con el destino, distintas entre sí y de duración razonable. Prioriza los intereses recibidos; cada actividad turística debe incluir interest_tags con intereses exactos de la lista si se proporcionó. No marques precios como verificados ni gratis verificados.",
    `El presupuesto indicado es exclusivamente para visitas y actividades turísticas; excluye vuelos, transporte entre ciudades, transporte urbano, alojamiento, compras personales y comidas. Las comidas usan type breakfast/lunch/dinner y budget_category=gastronomy, sin coste de entradas. Desplazamientos usan type=travel y no se suman al presupuesto. Visitas usan type=activity y budget_category=activity. Incluye exactamente ${requestedDays} jornadas, numeradas consecutivamente desde 1, y un máximo estructural de 12 bloques por jornada. Los bloques deben durar entre 1 y 720 minutos, estar dentro de 09:00–21:00 y no solaparse. Devuelve los bloques en orden cronológico. Genera JSON compacto y no añadas claves ajenas al esquema. El precio por persona es opcional: si no puedes estimarlo usa price_status=unknown y omite el coste; si estimas, usa price_status=estimate. No confundas desconocido con gratis. Usa la moneda indicada en contexto o EUR. Si hay fechas, conserva el intervalo y la duración exactos; si no, deduce la duración de la solicitud, y si no puede deducirse usa 1.`,
    ...(context?.segmentedRequest ? ["Este es un tramo de un viaje más largo: genera exclusivamente las jornadas indicadas por las fechas y la duración de este contexto. No añadas jornadas del resto del viaje."] : []),
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
    let previousEndMinutes = 9 * 60;
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
      if (interestTagsValue !== undefined && (
        !Array.isArray(interestTagsValue) || interestTagsValue.length < 1 ||
        interestTagsValue.some((tag) => typeof tag !== "string" || !context?.interests?.includes(tag))
      )) errors.push(`days[${index}].activities[${activityIndex}].interest_tags`);
      if (context?.interests?.length && (!Array.isArray(interestTagsValue) || interestTagsValue.length === 0)) {
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
        if (startMinutes < 9 * 60 || endMinutes > 21 * 60) errors.push(`days[${index}].activities[${activityIndex}].time_range`);
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

async function requestCompletion(
  messages: OpenRouterMessage[],
  apiKey: string,
  model: string,
  allowEmpty = false,
): Promise<CompletionResult> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-OpenRouter-Title": "Viajes",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        reasoning: { effort: "low", exclude: true },
        temperature: 1,
        messages,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AssistantProviderError("No se pudo conectar con OpenRouter. Comprueba la conexión e inténtalo de nuevo.", 503);
  }

  const data = await readJsonResponse(response);
  if (!data) {
    if (!response.ok) throw mapOpenRouterError(response.status);
    throw new AssistantProviderError("OpenRouter devolvió una respuesta no válida.", 502);
  }
  const choice = data.choices?.[0];
  const text = extractText(choice?.message?.content) ?? extractText(choice?.message?.refusal) ?? "";
  if (!response.ok || data.error) {
    const providerStatus = !response.ok
      ? response.status
      : statusFromProviderCode(getErrorCode(data.error)) ?? 502;
    const providerMessage = safeProviderMessage(getErrorMessage(data.error), apiKey);
    throw mapOpenRouterError(providerStatus, providerMessage);
  }

  if (!text && choice?.finish_reason !== "length" && !allowEmpty) {
    throw new AssistantProviderError("OpenRouter no devolvió contenido para esta solicitud.", 502);
  }
  return {
    text,
    finishReason: choice?.finish_reason ?? null,
    model: typeof data.model === "string" ? data.model : model,
    httpStatus: response.status,
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

export async function generateTravelAssistantReply(message: string, context?: AssistantContext): Promise<AssistantReply> {
  const mode = process.env.NEXT_PUBLIC_APP_MODE ?? "demo";
  if (mode === "demo") return demoReply(message, context);
  if (mode !== "production") throw new AssistantProviderError("NEXT_PUBLIC_APP_MODE debe ser demo o production.", 500);

  const provider = process.env.AI_PROVIDER ?? "openrouter";
  if (provider !== "openrouter") throw new AssistantProviderError("AI_PROVIDER debe ser openrouter para esta integración.", 500);

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new AssistantProviderError("Falta AI_API_KEY para activar OpenRouter en modo production.", 503);
  const model = process.env.AI_MODEL ?? DEFAULT_MODEL;
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
      const segmentReply = await generateTravelAssistantReply(
        `${message}\nGenera únicamente el tramo de los días ${startDay} a ${endDay} del itinerario.${
          previousActivityNames.length
            ? ` No repitas estas actividades ya asignadas a días anteriores: ${previousActivityNames.join("; ")}.`
            : ""
        }`,
        segmentContext,
      );
      lastModel = segmentReply.model ?? lastModel;
      if (!segmentReply.itinerary) {
        console.warn("OpenRouter itinerary segment incomplete " + JSON.stringify({
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
    const combinedValidation = validateAndNormalizeItinerary(combined, context);
    const plan = combinedValidation.value;
    if (!plan || plan.days.length !== requestedDays) {
      console.warn("OpenRouter segmented itinerary validation failed " + JSON.stringify({
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

  let completion = await requestCompletion(messages, apiKey, model);
  if (!structuredItineraryRequested) {
    let combinedText = completion.text;
    let continuations = 0;
    while (completion.finishReason === "length" && continuations < MAX_CONTINUATIONS) {
      if (combinedText.length > MAX_COMPLETION_LENGTH) break;
      messages.push(
        { role: "assistant", content: combinedText },
        { role: "user", content: "Continúa la respuesta desde donde se cortó, sin repetir texto anterior." },
      );
      completion = await requestCompletion(messages, apiKey, model);
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
    const parsed = parseItineraryJson(responseText);
    const validation = rejectNextParsedResponse
      ? { errors: ["json.multiple_distinct_itineraries"] }
      : parsed.value === undefined
      ? { errors: parsed.errors }
      : validateAndNormalizeItinerary(parsed.value, context);
    rejectNextParsedResponse = false;
    const plan = validation.value;
    lastParseErrors = parsed.errors;
    lastJsonExtracted = parsed.value !== undefined;

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
      const nextCompletion = await requestCompletion(messages, apiKey, model, true);

      if (nextCompletion.text) {
        const nextParsed = parseItineraryJson(nextCompletion.text);
        const nextValidation = nextParsed.value === undefined
          ? { errors: nextParsed.errors }
          : validateAndNormalizeItinerary(nextParsed.value, context);

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
      completion = await requestCompletion(messages, apiKey, model, true);
      responseText = completion.text;
      repairCount += 1;
      rejectNextParsedResponse = false;
      continue;
    }
    break;
  }

  console.warn("OpenRouter itinerary validation failed " + JSON.stringify({
    httpStatus: completion.httpStatus,
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
