import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateTravelAssistantReply,
  mapOpenRouterError,
  parseItineraryJson,
  validateItinerary,
} from "@/lib/ai";

const MODEL = "minimax/minimax-m3.1-flash:free";
const SECRET_TEST_KEY = "test-key-not-for-network";

function enableOpenRouter() {
  vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
  vi.stubEnv("AI_PROVIDER", "openrouter");
  vi.stubEnv("AI_API_KEY", SECRET_TEST_KEY);
  vi.stubEnv("AI_MODEL", MODEL);
}

function mockOpenRouter(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function completion(content: string, finishReason = "stop") {
  return {
    model: MODEL,
    choices: [{ message: { content }, finish_reason: finishReason }],
  };
}

function itinerary(overrides: Record<string, unknown> = {}) {
  return {
    destination: "Marrakech",
    duration_days: 2,
    budget: { total: 180, currency: "EUR", status: "estimated" },
    days: [
      {
        day: 1,
        title: "Descubrir la Medina",
        activities: [{
          name: "Visitar la Medina",
          description: "Recorrido orientativo por el barrio histórico.",
          estimated_duration_minutes: 90,
          estimated_cost: 0,
          currency: "EUR",
        }],
      },
      {
        day: 2,
        title: "Jardines y cultura",
        activities: [{
          name: "Paseo por los jardines",
          description: "Visita de duración orientativa.",
          estimated_duration_minutes: 60,
          estimated_cost: 12,
          currency: "EUR",
        }],
      },
    ],
    ...overrides,
  };
}

function itineraryForDays(count: number, dayOffset = 0) {
  return {
    destination: "Marrakech",
    duration_days: count,
    budget: { total: 180, currency: "EUR", status: "estimated" },
    days: Array.from({ length: count }, (_, index) => ({
      day: index + 1,
      title: `Jornada ${dayOffset + index + 1}`,
      activities: [{
        name: `Actividad ${dayOffset + index + 1}`,
        description: "Visita orientativa.",
        estimated_duration_minutes: 60,
        price_status: "unknown",
        currency: "EUR",
      }],
    })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenRouter assistant", () => {
  it("mantiene el modo demo sin llamar a OpenRouter", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "demo");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech", { destination: "Marrakech" });

    expect(reply.source).toBe("demo");
    expect(reply.text).toContain("Marrakech");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envía la solicitud al endpoint y modelo configurados y devuelve texto", async () => {
    enableOpenRouter();
    const fetchMock = mockOpenRouter(completion("Ruta sugerida.", "stop"));

    const reply = await generateTravelAssistantReply("Dame ideas para viajar");

    expect(reply.text).toBe("Ruta sugerida.");
    expect(reply.source).toBe("openrouter");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe(`Bearer ${SECRET_TEST_KEY}`);
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: MODEL,
      max_tokens: 8192,
      reasoning: { effort: "low", exclude: true },
    });
  });

  it("admite una respuesta JSON completa", async () => {
    enableOpenRouter();
    const expected = validateItinerary(itinerary());
    mockOpenRouter(completion(JSON.stringify(itinerary())));

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");

    expect(reply.itinerary).toEqual(expected);
    expect(reply.itinerary?.days.map((day) => day.dayNumber)).toEqual([1, 2]);
    expect(reply.itinerary?.days[0].items.find((item) => item.blockType === "activity")?.source).toBe("orientativo");
  });

  it("genera un itinerario de seis días en bloques, mantiene fechas y ordena todas las jornadas", async () => {
    enableOpenRouter();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(itineraryForDays(4)))), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(itineraryForDays(2, 4)))), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply(
      "Organiza un viaje de seis días a Marrakech",
      { destination: "Marrakech", startDate: "2026-04-12", endDate: "2026-04-17", budget: 180, currency: "EUR" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reply.itinerary?.days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reply.itinerary?.days.map((day) => day.date)).toEqual([
      "2026-04-12", "2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17",
    ]);
    const blockIds = reply.itinerary?.days.flatMap((day) => day.items.map((item) => item.id)) ?? [];
    expect(new Set(blockIds).size).toBe(blockIds.length);
    expect(reply.itinerary?.days.every((day) => day.items.some((item) => item.blockType === "activity"))).toBe(true);
    const firstPrompt = JSON.parse(String(fetchMock.mock.calls[0][1].body)).messages[1].content as string;
    const secondPrompt = JSON.parse(String(fetchMock.mock.calls[1][1].body)).messages[1].content as string;
    expect(firstPrompt).toContain('"duration_days":4');
    expect(firstPrompt).toContain('"day":4');
    expect(secondPrompt).toContain('"duration_days":2');
    expect(secondPrompt).toContain("2026-04-16");
  });

  it.each([1, 3, 5, 7, 30])("procesa todos los %i días solicitados dentro del límite de 30", async (days) => {
    enableOpenRouter();
    const responseBodies: unknown[] = [];
    for (let offset = 0; offset < days; offset += 4) {
      responseBodies.push(completion(JSON.stringify(itineraryForDays(Math.min(4, days - offset), offset))));
    }
    const fetchMock = vi.fn();
    for (const body of responseBodies) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    vi.stubGlobal("fetch", fetchMock);
    const start = new Date("2026-04-12T00:00:00Z");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + days - 1);
    const toDate = (date: Date) => date.toISOString().slice(0, 10);

    const reply = await generateTravelAssistantReply(`Organiza un viaje de ${days} días`, {
      destination: "Marrakech",
      startDate: toDate(start),
      endDate: toDate(end),
      budget: 180,
      currency: "EUR",
    });

    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(days / 4));
    expect(reply.itinerary?.durationDays).toBe(days);
    expect(reply.itinerary?.days.map((entry) => entry.dayNumber)).toEqual(
      Array.from({ length: days }, (_, index) => index + 1),
    );
    expect(reply.itinerary?.days.map((entry) => entry.date)).toEqual(
      Array.from({ length: days }, (_, index) => {
        const date = new Date(start);
        date.setUTCDate(date.getUTCDate() + index);
        return toDate(date);
      }),
    );
    const blockIds = reply.itinerary?.days.flatMap((entry) => entry.items.map((item) => item.id)) ?? [];
    expect(new Set(blockIds).size).toBe(blockIds.length);
  });

  it("no devuelve jornadas parciales cuando falla la validación de un bloque posterior", async () => {
    enableOpenRouter();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(itineraryForDays(4)))), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockImplementation(async () => new Response(JSON.stringify(completion("{invalid}", "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje de cinco días", {
      destination: "Marrakech",
      startDate: "2026-04-12",
      endDate: "2026-04-16",
    });

    expect(reply.itinerary).toBeUndefined();
    expect(reply.text).toContain("itinerario completo");
    expect(reply.warning).toContain("No se generaron todas las jornadas");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
  });

  it("conserva presupuesto, moneda, fechas y viajeros indicados en el contexto", async () => {
    enableOpenRouter();
    const response = itinerary({
      budget: { total: 180, currency: "USD", status: "estimated" },
      days: itinerary().days.map((day) => ({
        ...day,
        activities: day.activities.map((activity) => ({ ...activity, currency: "USD" })),
      })),
    });
    mockOpenRouter(completion(JSON.stringify(response)));

    const reply = await generateTravelAssistantReply("Organiza el viaje", {
      startDate: "2026-04-12",
      endDate: "2026-04-13",
      travelers: 3,
      budget: 700,
      currency: "USD",
    });

    expect(reply.itinerary).toMatchObject({
      startDate: "2026-04-12",
      endDate: "2026-04-13",
      travelers: 3,
      budget: { total: 700, currency: "USD", status: "provided" },
      days: [{ date: "2026-04-12" }, { date: "2026-04-13" }],
    });
  });

  it("acepta campos horarios snake_case y conserva las cuatro fechas del planificador", async () => {
    enableOpenRouter();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const startDate = "2026-10-20";
    const endDate = "2026-10-23";
    const response = {
      destination: "Marrakech",
      duration_days: 4,
      budget: { total: 100, currency: "EUR", status: "provided" },
      days: Array.from({ length: 4 }, (_, index) => ({
        day: index + 1,
        date: new Date(Date.parse(`${startDate}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10),
        title: `Jornada ${index + 1}`,
        activities: [{
          name: `Visita ${index + 1}`,
          description: "Actividad orientativa.",
          type: "activity",
          start_time: "10:00",
          end_time: "11:00",
          estimated_duration_minutes: 60,
          price_status: "unknown",
          budget_category: "activity",
          currency: "EUR",
          reliability: "unknown",
        }],
      })),
    };
    const fetchMock = mockOpenRouter(completion(JSON.stringify(response)));

    const reply = await generateTravelAssistantReply("Organiza un viaje barato a Marrakech", {
      startDate,
      endDate,
      travelers: 1,
      budget: 100,
      currency: "EUR",
    });

    expect(warn.mock.calls).toEqual([]);
    expect(reply.itinerary?.durationDays).toBe(4);
    expect(reply.itinerary?.days.map((day) => day.date)).toEqual([
      "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23",
    ]);
    expect(reply.itinerary?.days.map((day) =>
      day.items.find((item) => item.blockType === "activity")?.startTime,
    )).toEqual(["10:00", "10:00", "10:00", "10:00"]);
    expect(reply.itinerary?.budget).toEqual({ total: 100, currency: "EUR", status: "provided" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("pide español natural, actividades diferenciadas y agrupación geográfica prudente", async () => {
    enableOpenRouter();
    const fetchMock = mockOpenRouter(completion(JSON.stringify(itinerary())));
    await generateTravelAssistantReply("Organiza un viaje de dos días");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const prompt = body.messages[1].content as string;

    expect(prompt).toContain("español natural");
    expect(prompt).toContain("distintas entre sí");
    expect(prompt).toContain("solo cuando existan datos confiables");
  });

  it("exige etiquetas de interés válidas y calcula el coste total desde el precio por persona", () => {
    const taggedPlan = itinerary({
      days: itinerary().days.map((day, index) => ({
        ...day,
        activities: [{
          ...day.activities[0],
          estimated_cost: undefined,
          estimated_cost_per_person: index === 0 ? 12 : undefined,
          price_status: index === 0 ? "estimate" : "unknown",
          budget_category: "activity",
          interest_tags: ["Fútbol"],
        }],
      })),
    });
    const valid = validateItinerary(taggedPlan, { interests: ["Fútbol"], travelers: 3 });
    expect(valid?.days[0].items.find((item) => item.blockType === "activity")).toMatchObject({
      pricePerPerson: 12,
      estimate: 36,
      interestTags: ["Fútbol"],
    });
    expect(validateItinerary(taggedPlan, { interests: ["Arquitectura"], travelers: 3 })).toBeUndefined();
  });

  it("rechaza fuentes y precios verificados que el modelo no puede respaldar", () => {
    const unverifiedClaim = itinerary({
      days: itinerary().days.map((day) => ({
        ...day,
        activities: [{ ...day.activities[0], price_status: "verified", price_source: "sitio oficial" }],
      })),
    });
    expect(validateItinerary(unverifiedClaim)).toBeUndefined();
  });

  it("parsea JSON dentro de un bloque Markdown", () => {
    const parsed = parseItineraryJson(`Respuesta:\n\n\`\`\`json\n${JSON.stringify(itinerary())}\n\`\`\`\n`);

    expect(parsed.errors).toEqual([]);
    expect(parsed.objectCount).toBe(1);
    expect(validateItinerary(parsed.value)?.durationDays).toBe(2);
  });

  it("rechaza objetos distintos aunque uno esté dentro de un bloque Markdown", () => {
    const parsed = parseItineraryJson(
      `\`\`\`json\n${JSON.stringify(itinerary())}\n\`\`\`\n${JSON.stringify(itinerary({ destination: "Fez" }))}`,
    );

    expect(parsed.errors).toContain("json.multiple_objects");
  });

  it("normaliza aliases de la forma existente ItineraryDay/ItineraryItem", () => {
    const domainShape = {
      destination: "Marrakech",
      durationDays: 1,
      budget: { total: 80, currency: "EUR" },
      days: [{
        dayNumber: 1,
        theme: "Medina",
        summary: "Resumen corto.",
        items: [{
          name: "Paseo",
          description: "Visita de demostración.",
          durationMinutes: 75,
          estimate: 0,
          currency: "EUR",
        }],
      }],
    };
    const result = validateItinerary(domainShape);

    expect(result?.days[0]).toMatchObject({
      dayNumber: 1,
      theme: "Medina",
      summary: "Resumen corto.",
    });
    const activity = result?.days[0].items.find((item) => item.blockType === "activity");
    expect(activity).toMatchObject({ durationMinutes: 75, priceStatus: "unknown" });
    expect(activity?.estimate).toBeUndefined();
  });

  it("tolera propiedades opcionales y actividades sin coste sin inventar coordenadas", () => {
    const minimal = {
      destination: "Marrakech",
      duration_days: 1,
      budget: { total: 0, currency: "EUR" },
      days: [{
        day: 1,
        title: "Medina",
        activities: [{
          name: "Paseo",
          estimated_duration_minutes: 50,
        }],
      }],
    };
    const result = validateItinerary(minimal);
    const activity = result?.days[0].items.find((item) => item.blockType === "activity");

    expect(activity?.estimate).toBeUndefined();
    expect(activity?.currency).toBe("EUR");
    expect(activity?.notes).toContain("Coste desconocido");
    expect(activity?.lat).toBeUndefined();
    expect(activity?.startTime).toBeDefined();
    expect(result?.days[0].items.some((item) => item.blockType === "lunch")).toBe(true);
  });

  it("rechaza propiedades incompatibles y números con formato incorrecto", () => {
    const badShape = itinerary({
      duration_days: "2",
      days: [
        { day: 1, title: "Uno", activities: [{ name: "Paseo", duration: "90", cost: 0 }] },
        { day: 2, title: "Dos", activities: [{ name: "Museo", duration: 90, cost: -2 }] },
      ],
    });
    expect(validateItinerary(badShape)).toBeUndefined();
  });

  it("rechaza un número de días que no coincide con duration_days", () => {
    expect(validateItinerary(itinerary({ days: [itinerary().days[0]] }))).toBeUndefined();
  });

  it("rechaza jornadas que no coinciden con las fechas y actividades duplicadas", () => {
    const duplicated = itinerary({
      days: [
        itinerary().days[0],
        {
          ...itinerary().days[1],
          activities: [{ ...itinerary().days[0].activities[0], name: "  Visitar la medina " }],
        },
      ],
    });
    expect(validateItinerary(duplicated, {
      startDate: "2026-04-12",
      endDate: "2026-04-13",
    })).toBeUndefined();
    expect(validateItinerary(itinerary(), {
      startDate: "2026-04-12",
      endDate: "2026-04-13",
    })).toBeDefined();
  });

  it("valida presupuesto, moneda, fecha, orden y duración de actividades", () => {
    expect(validateItinerary(itinerary({ budget: { total: -1, currency: "EUR" } }))).toBeUndefined();
    expect(validateItinerary(itinerary({ budget: { total: 100, currency: "XYZ" } }))).toBeUndefined();
    expect(validateItinerary(itinerary({
      days: [
        { day: 1, title: "Día", date: "2026-02-30", activities: itinerary().days[0].activities },
        itinerary().days[1],
      ],
    }))).toBeUndefined();
    expect(validateItinerary(itinerary({
      days: [
        { day: 1, title: "Día", activities: [{ name: "Paseo", estimated_duration_minutes: 1500 }] },
        itinerary().days[1],
      ],
    }))).toBeUndefined();
    expect(validateItinerary(itinerary({
      days: [
        itinerary().days[0],
        { ...itinerary().days[1], day: 4 },
      ],
    }))).toBeUndefined();
    expect(validateItinerary(itinerary({
      days: [
        { ...itinerary().days[0], date: "2026-04-02" },
        { ...itinerary().days[1], date: "2026-04-04" },
      ],
    }), { startDate: "2026-04-02" })).toBeUndefined();
  });

  it("rechaza varias respuestas JSON distintas en lugar de concatenarlas", () => {
    const twoPlans = `${JSON.stringify(itinerary())}\n${JSON.stringify(itinerary({ destination: "Fez" }))}`;
    const parsed = parseItineraryJson(twoPlans);

    expect(parsed.value).toBeUndefined();
    expect(parsed.errors).toContain("json.multiple_objects");
    expect(parsed.objectCount).toBe(2);
  });

  it("deduplica un objeto JSON repetido idéntico", () => {
    const plan = JSON.stringify(itinerary());
    const parsed = parseItineraryJson(`${plan}\n${plan}`);

    expect(parsed.errors).toEqual([]);
    expect(parsed.objectCount).toBe(1);
  });

  it("continúa una respuesta truncada y evita solapar fragmentos", async () => {
    enableOpenRouter();
    const json = JSON.stringify(itinerary());
    const split = Math.floor(json.length / 2);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(json.slice(0, split), "length")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(json.slice(split), "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");

    expect(reply.itinerary?.durationDays).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).messages.at(-1).content)
      .toContain("objeto JSON truncado");
  });

  it("no acepta un JSON inicial truncado tras recibir una continuación vacía", async () => {
    enableOpenRouter();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(itinerary()), "length")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion("", "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(itinerary()), "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");

    expect(reply.itinerary?.destination).toBe("Marrakech");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1].body)).messages.at(-1).content)
      .toContain("Errores de validación");
  });

  it("regenera desde el prompt base tras una continuación truncada y limita la longitud del itinerario", async () => {
    enableOpenRouter();
    const truncatedMarker = "x".repeat(16_000);
    const truncated = `{"destination":"Marrakech","details":"${truncatedMarker}`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(truncated, "length")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(" }", "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(itinerary()), "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const continuationRequest = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    const repairRequest = JSON.parse(String(fetchMock.mock.calls[2][1].body));

    expect(reply.itinerary?.durationDays).toBe(2);
    expect(firstRequest.messages[1].content).toContain("máximo estructural de 12 bloques por jornada");
    expect(continuationRequest.messages.some((entry: { content: string }) => entry.content.includes(truncatedMarker))).toBe(true);
    expect(repairRequest.messages.some((entry: { content: string }) => entry.content.includes(truncatedMarker))).toBe(false);
    expect(repairRequest.messages.at(-1).content).toContain("Errores de validación");
  });

  it("recupera JSON inválido con una petición de corrección limitada", async () => {
    enableOpenRouter();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(completion("{invalid json}", "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(itinerary()), "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");
    const correction = JSON.parse(String(fetchMock.mock.calls[1][1].body)).messages.at(-1).content;

    expect(reply.itinerary?.days).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(correction).toContain("json.invalid");
  });

  it("no concatena dos objetos distintos devueltos durante una continuación", async () => {
    enableOpenRouter();
    const first = itinerary();
    const alternate = itinerary({ destination: "Fez" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(first), "length")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(alternate), "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion(JSON.stringify(first), "stop")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");
    const correction = JSON.parse(String(fetchMock.mock.calls[2][1].body)).messages.at(-1).content;

    expect(reply.itinerary?.destination).toBe("Marrakech");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(correction).toContain("json.multiple_distinct_itineraries");
  });

  it("no presenta como válido un JSON no recuperado y devuelve un mensaje reintentable", async () => {
    enableOpenRouter();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(
      completion("{\"destination\":\"Marrakech\",", "stop"),
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");
    const metadata = JSON.stringify(warn.mock.calls);

    expect(reply.itinerary).toBeUndefined();
    expect(reply.warning).toContain("respuesta quedó incompleta");
    expect(fetchMock).toHaveBeenCalledTimes(1 + 2);
    expect(metadata).toContain("json.truncated");
    expect(metadata).not.toContain("Marrakech");
  });

  it("acepta horarios tempranos y nocturnos del mismo día sin aplicar el rango antiguo", async () => {
    enableOpenRouter();
    const plan = itinerary();
    plan.days[0].activities = [
      Object.assign({ name: "Desayuno", description: "", estimated_duration_minutes: 45, estimated_cost: 0, currency: "EUR" }, { start_time: "07:30", end_time: "08:15" }),
      Object.assign({ name: "Visita nocturna", description: "", estimated_duration_minutes: 60, estimated_cost: 0, currency: "EUR" }, { start_time: "22:00", end_time: "23:00" }),
    ];
    mockOpenRouter(completion(JSON.stringify(plan)));

    const reply = await generateTravelAssistantReply("Organiza un viaje a Marrakech de dos días");

    expect(reply.itinerary?.days[0].items.map((item) => [item.name, item.startTime, item.endTime])).toEqual([
      ["Desayuno", "07:30", "08:15"],
      ["Desayuno libre", "09:00", "09:45"],
      ["Tiempo para almorzar", "13:00", "14:00"],
      ["Cena libre", "19:00", "20:00"],
      ["Visita nocturna", "22:00", "23:00"],
    ]);
  });

  it("mapea errores HTTP del proveedor sin convertirlos en respuestas demo", async () => {
    enableOpenRouter();
    mockOpenRouter({ error: { code: 429, message: "rate limit" } }, 429);

    await expect(generateTravelAssistantReply("Organiza un viaje a Marrakech"))
      .rejects.toMatchObject({ status: 429 });
  });

  it("valida y devuelve alternativas contextuales sin incluir datos ajenos a la actividad", async () => {
    enableOpenRouter();
    const fetchMock = mockOpenRouter(completion(JSON.stringify({ alternatives: [
      { name: "Museo de Arte", description: "Colección de arte moderno.", durationMinutes: 75, location: "Downtown" },
      { name: "Paseo arquitectónico", description: "Ruta a pie por edificios históricos.", durationMinutes: 45 },
    ] })));

    const reply = await generateTravelAssistantReply("Dame opciones similares", {
      destination: "Miami",
      interests: ["Arquitectura"],
      notes: "Evitar escaleras",
      activity: { name: "Freedom Tower", location: "Downtown", startTime: "10:00", endTime: "11:30", durationMinutes: 90 },
    });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));

    expect(reply.activityAlternatives).toEqual([
      { name: "Museo de Arte", description: "Colección de arte moderno.", durationMinutes: 75, location: "Downtown" },
      { name: "Paseo arquitectónico", description: "Ruta a pie por edificios históricos.", durationMinutes: 45 },
    ]);
    expect(requestBody.messages[1].content).toContain("Freedom Tower");
    expect(requestBody.messages[1].content).toContain("Evitar escaleras");
    expect(requestBody.messages[1].content).not.toContain("budget");
  });

  it("rechaza alternativas del proveedor que no cumplen el contrato", async () => {
    enableOpenRouter();
    mockOpenRouter(completion(JSON.stringify({ alternatives: [
      { name: "Actividad", description: "No válida", durationMinutes: 0 },
    ] })));

    await expect(generateTravelAssistantReply("Busca otra opción", {
      destination: "Miami",
      activity: { name: "Freedom Tower" },
    })).rejects.toMatchObject({ status: 502 });
  });

  it("traduce estados HTTP conocidos", () => {
    for (const status of [401, 402, 403, 404, 429, 503]) {
      expect(mapOpenRouterError(status).status).toBe(status);
    }
  });
});
