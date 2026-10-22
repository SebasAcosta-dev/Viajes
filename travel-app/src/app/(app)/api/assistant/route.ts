import { NextResponse } from "next/server";
import { AssistantProviderError, generateTravelAssistantReply, type AssistantContext } from "@/lib/ai";
import type { Currency } from "@/lib/types";
import { requestTodayIso } from "@/lib/trip-dates";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/http";

const currencies: Currency[] = ["EUR", "USD", "GBP", "MAD"];
const assistantRequestSchema = z.object({
  message: z.string().trim().min(1, "Debes indicar una solicitud de viaje.").max(2000, "La solicitud no puede superar los 2000 caracteres."),
  context: z.unknown().optional(),
}).strict();

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseContext(value: unknown, today: string): AssistantContext | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const rawActivity = input.activity;
  if (rawActivity !== undefined && (
    !rawActivity || typeof rawActivity !== "object" || Array.isArray(rawActivity)
  )) return null;
  const activity = rawActivity as Record<string, unknown> | undefined;
  if (
    (input.destination !== undefined && (typeof input.destination !== "string" || input.destination.length > 120)) ||
    (input.origin !== undefined && (typeof input.origin !== "string" || input.origin.length > 120)) ||
    (input.budget !== undefined && (typeof input.budget !== "number" || !Number.isFinite(input.budget) || input.budget < 0)) ||
    (input.travelers !== undefined && (typeof input.travelers !== "number" || !Number.isInteger(input.travelers) || input.travelers < 1 || input.travelers > 100)) ||
    (input.interests !== undefined && (!Array.isArray(input.interests) || input.interests.length > 200 || input.interests.some((interest) => typeof interest !== "string" || !interest.trim() || interest.length > 80))) ||
    (input.pace !== undefined && (typeof input.pace !== "string" || !["lento", "equilibrado", "rápido"].includes(input.pace))) ||
    (input.travelType !== undefined && (typeof input.travelType !== "string" || input.travelType.length > 80)) ||
    (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > 1000)) ||
    (input.startDate !== undefined && !isValidIsoDate(input.startDate)) ||
    (input.endDate !== undefined && !isValidIsoDate(input.endDate)) ||
    (input.currency !== undefined && (typeof input.currency !== "string" || !currencies.includes(input.currency as Currency))) ||
    (activity !== undefined && (
      typeof activity.name !== "string" || !activity.name.trim() || activity.name.length > 160 ||
      (activity.description !== undefined && (typeof activity.description !== "string" || activity.description.length > 1000)) ||
      (activity.location !== undefined && (typeof activity.location !== "string" || activity.location.length > 240)) ||
      (activity.startTime !== undefined && (typeof activity.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(activity.startTime))) ||
      (activity.endTime !== undefined && (typeof activity.endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(activity.endTime))) ||
      (activity.durationMinutes !== undefined && (typeof activity.durationMinutes !== "number" || !Number.isInteger(activity.durationMinutes) || activity.durationMinutes < 1 || activity.durationMinutes > 1440))
    ))
  ) {
    return null;
  }
  if (typeof input.startDate === "string" && typeof input.endDate === "string" && input.endDate < input.startDate) {
    return null;
  }
  if ((typeof input.startDate === "string" && input.startDate < today)
    || (typeof input.endDate === "string" && input.endDate < today)) return null;
  if (
    typeof input.startDate === "string" && typeof input.endDate === "string"
    && (Date.parse(`${input.endDate}T00:00:00Z`) - Date.parse(`${input.startDate}T00:00:00Z`)) / 86_400_000 >= 30
  ) return null;

  const context: AssistantContext = {};
  if (typeof input.origin === "string") context.origin = input.origin;
  if (typeof input.destination === "string") context.destination = input.destination;
  if (typeof input.budget === "number") context.budget = input.budget;
  if (typeof input.travelers === "number") context.travelers = input.travelers;
  if (Array.isArray(input.interests)) context.interests = [...new Set(input.interests as string[])];
  if (typeof input.pace === "string") context.pace = input.pace;
  if (typeof input.travelType === "string") context.travelType = input.travelType;
  if (typeof input.notes === "string") context.notes = input.notes;
  if (typeof input.startDate === "string") context.startDate = input.startDate;
  if (typeof input.endDate === "string") context.endDate = input.endDate;
  if (typeof input.currency === "string") context.currency = input.currency as Currency;
  if (activity) {
    context.activity = {
      name: activity.name as string,
      ...(typeof activity.description === "string" ? { description: activity.description } : {}),
      ...(typeof activity.location === "string" ? { location: activity.location } : {}),
      ...(typeof activity.startTime === "string" ? { startTime: activity.startTime } : {}),
      ...(typeof activity.endTime === "string" ? { endTime: activity.endTime } : {}),
      ...(typeof activity.durationMinutes === "number" ? { durationMinutes: activity.durationMinutes } : {}),
    };
  }
  return context;
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, assistantRequestSchema, "El cuerpo de la solicitud debe ser JSON válido.");
  if (!parsed.ok) return parsed.response;
  const { message, context: rawContext } = parsed.data;
  const context = parseContext(rawContext, requestTodayIso(request));
  if (!context) {
    return NextResponse.json({ error: "El contexto del viaje no tiene un formato válido." }, { status: 400 });
  }

  try {
    const response = await generateTravelAssistantReply(message, context);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AssistantProviderError) {
      console.warn("Assistant provider request failed", { status: error.status, errorType: error.name });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Assistant request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "No se pudo procesar la solicitud del asistente." }, { status: 500 });
  }
}
