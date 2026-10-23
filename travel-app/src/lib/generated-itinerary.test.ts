import { afterEach, describe, expect, it } from "vitest";
import { loadGeneratedItinerary, loadTripFormDraft, saveGeneratedItinerary, saveTripFormDraft } from "@/lib/generated-itinerary";
import type { TripFormValues } from "@/lib/types";

const form: TripFormValues = {
  origin: "Madrid",
  destination: "Marrakech",
  startDate: "2026-10-20",
  endDate: "2026-10-21",
  travelers: 2,
  budget: 200,
  currency: "EUR",
  interests: ["Historia", "Fútbol"],
  travelType: "Cultural",
  pace: "equilibrado",
  notes: "",
};

afterEach(() => localStorage.clear());

describe("borradores del planificador", () => {
  it("mantiene los datos del formulario después de navegar o recargar", () => {
    saveTripFormDraft(form);
    expect(loadTripFormDraft()).toEqual(form);
  });

  it("recupera borradores sin tipo de viaje ni ritmo y aplica valores compatibles", () => {
    const formWithoutOptionalFields = { ...form };
    delete formWithoutOptionalFields.travelType;
    delete formWithoutOptionalFields.pace;
    localStorage.setItem("viajes.trip-form-draft.v1.anonymous", JSON.stringify(formWithoutOptionalFields));

    expect(loadTripFormDraft()).toMatchObject({ travelType: "Combinado", pace: "equilibrado" });
  });

  it("conserva el itinerario generado para la página de resultados", () => {
    const draft = {
      form,
      source: "demo" as const,
      generatedAt: "2026-10-20T00:00:00.000Z",
      itinerary: {
        destination: "Marrakech",
        durationDays: 2,
        startDate: form.startDate,
        endDate: form.endDate,
        travelers: 2,
        budget: { total: 200, currency: "EUR" as const, status: "provided" as const },
        days: [],
      },
    };
    saveGeneratedItinerary(draft);
    expect(loadGeneratedItinerary()).toEqual(draft);
  });

  it("aísla borradores por cuenta y no almacena intereses habituales dentro del borrador autenticado", () => {
    saveTripFormDraft(form, "user:account-1");
    saveTripFormDraft({ ...form, interests: ["Fútbol"] }, "user:account-2");

    expect(loadTripFormDraft("user:account-1")?.interests).toEqual([]);
    expect(loadTripFormDraft("user:account-2")?.interests).toEqual([]);
    expect(loadTripFormDraft("anonymous")).toBeNull();
  });

  it("mantiene las selecciones locales de usuarios anónimos separadas de las cuentas", () => {
    saveTripFormDraft(form, "anonymous");
    saveTripFormDraft({ ...form, interests: ["Fútbol"] }, "user:account-1");

    expect(loadTripFormDraft("anonymous")?.interests).toEqual(["Historia", "Fútbol"]);
    expect(loadTripFormDraft("user:account-1")?.interests).toEqual([]);
  });

  it("no muestra a una cuenta el itinerario local de otra cuenta", () => {
    const draft = {
      form,
      source: "demo" as const,
      generatedAt: "2026-10-20T00:00:00.000Z",
      itinerary: {
        destination: "Marrakech",
        durationDays: 2,
        startDate: form.startDate,
        endDate: form.endDate,
        travelers: 2,
        budget: { total: 200, currency: "EUR" as const, status: "provided" as const },
        days: [],
      },
    };
    saveGeneratedItinerary(draft, "user:account-1");

    expect(loadGeneratedItinerary("user:account-1")).toEqual(draft);
    expect(loadGeneratedItinerary("user:account-2")).toBeNull();
  });
});
