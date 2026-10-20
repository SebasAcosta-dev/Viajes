import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";
import { getAuthenticatedSupabase } from "@/app/lib/persistence/server";

vi.mock("@/app/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createSupabaseServerClient);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("autorización Supabase", () => {
  it("rechaza solicitudes sin sesión autenticada", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } }) },
    } as never);

    await expect(getAuthenticatedSupabase())
      .rejects.toMatchObject({ status: 401 });
  });

  it("falla cerrado con token expirado y clasifica la sesión como inválida", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 401 } }) },
    } as never);

    await expect(getAuthenticatedSupabase()).rejects.toMatchObject({ status: 401 });
  });

  it("no concede acceso cuando Supabase Auth no responde", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "supabase");
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: undefined } }) },
    } as never);

    await expect(getAuthenticatedSupabase()).rejects.toMatchObject({ status: 503 });
  });

  it("requiere que la persistencia Supabase esté explícitamente habilitada", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "demo");
    await expect(getAuthenticatedSupabase())
      .rejects.toMatchObject({ status: 404 });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("define RLS por usuario en todas las tablas privadas y deja público solo el catálogo", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase", "migrations", "20261019000100_initial_schema.sql"), "utf8");
    for (const table of ["profiles", "trips", "trip_days", "activities", "favorites", "expenses"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`(select auth.uid())`);
    }
    expect(migration).toContain('"destinations_read_public"');
    expect(migration).toContain('"places_read_public"');
    expect(migration).not.toMatch(/service_role/i);
  });

  it("añade los campos de horario de forma incremental y los escribe en la función existente", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase", "migrations", "20261020000300_itinerary_schedule.sql"), "utf8");
    expect(migration).toContain("alter table public.activities");
    for (const column of ["block_type", "location_label", "travel_minutes", "data_reliability"]) {
      expect(migration).toContain(`add column ${column}`);
      expect(migration).toContain(column);
    }
    expect(migration).toContain("create or replace function public.create_trip_with_itinerary");
    expect(migration).not.toMatch(/drop table|disable row level security/i);
  });

  it("mantiene los metadatos de actividad de la migración anterior como requisito previo", () => {
    const metadataMigration = readFileSync(resolve(process.cwd(), "supabase", "migrations", "20261020000200_itinerary_activity_metadata.sql"), "utf8");
    for (const column of ["price_per_person", "price_status", "price_source", "price_checked_at", "interest_tags", "budget_category"]) {
      expect(metadataMigration).toContain(`add column ${column}`);
      expect(metadataMigration).toContain(column);
    }
    expect(metadataMigration).toContain("create or replace function public.create_trip_with_itinerary");
    expect(metadataMigration).not.toMatch(/drop table|disable row level security/i);
  });

  it("solo reasocia gastos a actividades con nombre único en el viaje y jornada reemplazados", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase", "migrations", "20261020000400_trip_management.sql"), "utf8");
    const functionStart = migration.indexOf("create or replace function public.replace_trip_day");
    const functionEnd = migration.indexOf("\nrevoke all on function public.update_trip_details", functionStart);
    const replaceDay = migration.slice(functionStart, functionEnd);

    expect(replaceDay).toContain("'old_activity_count'");
    expect(replaceDay).toContain("same_name.trip_id = p_trip_id");
    expect(replaceDay).toContain("same_name.day_id = current_day_id");
    expect(replaceDay).toContain("new_activity_name_count = 1");
    expect(replaceDay).toContain("(old_activity.value ->> 'old_activity_count')::integer = 1");
    expect(replaceDay).toContain("expense.trip_id = p_trip_id");
    expect(replaceDay).toContain("expense.user_id = auth.uid()");
    expect(replaceDay).toContain("expense.activity_id is null");
    expect(replaceDay).not.toMatch(/delete\s+from\s+public\.expenses/i);
  });
});
