import { afterEach, describe, expect, it, vi } from "vitest";
import { addIsoDays } from "@/lib/date-format";
import { dateInTimeZone } from "@/lib/trip-dates";

const { generateTravelAssistantReplyMock } = vi.hoisted(() => ({
  generateTravelAssistantReplyMock: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  AssistantProviderError: class AssistantProviderError extends Error {},
  generateTravelAssistantReply: generateTravelAssistantReplyMock,
}));

import { POST } from "@/app/(app)/api/assistant/route";

const today = dateInTimeZone(new Date(), "UTC");

function request(startDate: string, endDate: string) {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Time-Zone": "UTC" },
    body: JSON.stringify({
      message: "Prepara un viaje",
      context: { startDate, endDate },
    }),
  });
}

afterEach(() => vi.clearAllMocks());

describe("validación de fechas del asistente", () => {
  it("rechaza fechas pasadas usando la zona horaria de la petición", async () => {
    const yesterday = addIsoDays(today, -1) ?? today;

    const response = await POST(request(yesterday, today));

    expect(response.status).toBe(400);
    expect(generateTravelAssistantReplyMock).not.toHaveBeenCalled();
  });

  it("acepta intervalos desde hoy", async () => {
    generateTravelAssistantReplyMock.mockResolvedValue({ source: "demo", text: "Listo" });

    const response = await POST(request(today, addIsoDays(today, 2) ?? today));

    expect(response.status).toBe(200);
    expect(generateTravelAssistantReplyMock).toHaveBeenCalledOnce();
  });

  it("valida y reenvía el contexto mínimo de una actividad al asistente existente", async () => {
    generateTravelAssistantReplyMock.mockResolvedValue({ source: "openrouter", text: "Alternativas", activityAlternatives: [] });
    const response = await POST(new Request("http://localhost/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Time-Zone": "UTC" },
      body: JSON.stringify({
        message: "Sugiere tres alternativas",
        context: {
          destination: "Miami",
          interests: ["Arquitectura"],
          activity: { name: "Freedom Tower", location: "Centro", startTime: "10:00", endTime: "11:30", durationMinutes: 90 },
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect(generateTravelAssistantReplyMock).toHaveBeenCalledWith("Sugiere tres alternativas", expect.objectContaining({
      destination: "Miami",
      interests: ["Arquitectura"],
      activity: { name: "Freedom Tower", location: "Centro", startTime: "10:00", endTime: "11:30", durationMinutes: 90 },
    }));
    expect(await response.json()).toMatchObject({ activityAlternatives: [] });
  });
});
