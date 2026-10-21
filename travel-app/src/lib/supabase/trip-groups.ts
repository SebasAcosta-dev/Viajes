import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type GeneratedFunctions = Database["public"]["Functions"];
type GeneratedTripGroupFunction = GeneratedFunctions["create_trip_group"];

/**
 * SQL defines date[] and the function permits NULL array elements. The
 * generated RPC Args type currently models date[] as string[], so this local
 * refinement represents the verified SQL contract without editing generated
 * output.
 */
export type CreateTripGroupArgs = Omit<GeneratedTripGroupFunction["Args"], "p_starts_on" | "p_ends_on"> & {
  p_starts_on: (string | null)[];
  p_ends_on: (string | null)[];
};

type TripGroupFunctionWithNullableDates = Omit<GeneratedTripGroupFunction, "Args"> & {
  Args: CreateTripGroupArgs;
};

type FunctionsWithNullableTripGroupDates = Omit<GeneratedFunctions, "create_trip_group"> & {
  create_trip_group: TripGroupFunctionWithNullableDates;
};

export type DatabaseWithNullableTripGroupDates = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: FunctionsWithNullableTripGroupDates;
  };
};

export type TripGroupRpcClient = SupabaseClient<DatabaseWithNullableTripGroupDates, "public">;

export function createTripGroup(supabase: TripGroupRpcClient, args: CreateTripGroupArgs) {
  return supabase.rpc("create_trip_group", args);
}
