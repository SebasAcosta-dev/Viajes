import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SavedExpense } from "@/lib/persistence/types";
import type { Currency } from "@/lib/types";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";

type AppSupabase = SupabaseClient<Database, "public">;
export type ExpenseInput = Omit<SavedExpense, "id" | "tripId" | "createdAt">;

function mapExpense(row: Record<string, unknown>): SavedExpense {
  const currency = row.currency as Currency;
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    category: String(row.category),
    description: String(row.description),
    amount: fromMinorUnits(Number(row.amount), currency),
    currency,
    incurredOn: String(row.incurred_on),
    createdAt: String(row.created_at),
    ...(typeof row.notes === "string" ? { notes: row.notes } : {}),
    ...(typeof row.activity_id === "string" ? { activityId: row.activity_id } : {}),
  };
}

export async function createExpense(
  supabase: AppSupabase,
  userId: string,
  tripId: string,
  expense: ExpenseInput,
): Promise<SavedExpense | "ACTIVITY_NOT_OWNED"> {
  if (expense.activityId) {
    const { data, error } = await supabase.from("activities").select("id")
      .eq("id", expense.activityId).eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return "ACTIVITY_NOT_OWNED";
  }
  const { data, error } = await supabase.from("expenses").insert({
    trip_id: tripId,
    user_id: userId,
    category: expense.category,
    description: expense.description,
    amount: toMinorUnits(expense.amount, expense.currency),
    currency: expense.currency,
    incurred_on: expense.incurredOn,
    notes: expense.notes ?? "",
    activity_id: expense.activityId ?? null,
  }).select("*").single();
  if (error) throw error;
  return mapExpense(data as unknown as Record<string, unknown>);
}

export async function updateExpense(
  supabase: AppSupabase,
  userId: string,
  tripId: string,
  expenseId: string,
  expense: ExpenseInput,
): Promise<SavedExpense | "ACTIVITY_NOT_OWNED" | null> {
  if (expense.activityId) {
    const { data, error } = await supabase.from("activities").select("id")
      .eq("id", expense.activityId).eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return "ACTIVITY_NOT_OWNED";
  }
  const { data, error } = await supabase.from("expenses").update({
    category: expense.category,
    description: expense.description,
    amount: toMinorUnits(expense.amount, expense.currency),
    currency: expense.currency,
    incurred_on: expense.incurredOn,
    notes: expense.notes ?? "",
    activity_id: expense.activityId ?? null,
  }).eq("trip_id", tripId).eq("id", expenseId).eq("user_id", userId).select("*").maybeSingle();
  if (error) throw error;
  return data ? mapExpense(data as unknown as Record<string, unknown>) : null;
}

export async function deleteExpense(supabase: AppSupabase, userId: string, tripId: string, expenseId: string): Promise<boolean> {
  const { data, error } = await supabase.from("expenses").delete()
    .eq("trip_id", tripId).eq("id", expenseId).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
