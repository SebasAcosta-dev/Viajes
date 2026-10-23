import { describe, expect, it } from "vitest";
import { toSupabaseJson } from "@/lib/supabase/json";

describe("toSupabaseJson", () => {
  it("preserves nested JSON values and omits undefined object properties", () => {
    expect(toSupabaseJson({
      name: "Lisboa",
      optional: undefined,
      itinerary: [{ dayNumber: 1, date: null, items: [{ name: "Museo", estimate: 0 }] }],
    })).toEqual({
      name: "Lisboa",
      itinerary: [{ dayNumber: 1, date: null, items: [{ name: "Museo", estimate: 0 }] }],
    });
  });

  it("preserves null array elements and rejects non-finite numbers", () => {
    expect(toSupabaseJson(["2026-10-21", null])).toEqual(["2026-10-21", null]);
    expect(() => toSupabaseJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
