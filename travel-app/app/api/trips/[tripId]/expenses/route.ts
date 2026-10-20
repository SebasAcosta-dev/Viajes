import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/app/lib/persistence/server";
import { validateExpense } from "@/app/lib/persistence/validation";
import type { Currency } from "@/app/lib/types";

function mapExpense(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    category: String(row.category),
    description: String(row.description),
    amount: Number(row.amount),
    currency: row.currency as Currency,
    incurredOn: String(row.incurred_on),
    createdAt: String(row.created_at),
    ...(typeof row.notes === "string" ? { notes: row.notes } : {}),
    ...(typeof row.activity_id === "string" ? { activityId: row.activity_id } : {}),
  };
}

export async function POST(request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const expense = validateExpense(body);
    if (!expense) return Response.json({ error: "Los datos del gasto no son válidos." }, { status: 400 });
    if (expense.activityId) {
      const { data: activity, error: activityError } = await supabase.from("activities")
        .select("id")
        .eq("id", expense.activityId)
        .eq("trip_id", tripId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (activityError) throw activityError;
      if (!activity) return Response.json({ error: "La actividad relacionada no pertenece a este viaje o ya no existe." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        trip_id: tripId,
        user_id: user.id,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        incurred_on: expense.incurredOn,
        notes: expense.notes ?? "",
        activity_id: expense.activityId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return Response.json({ expense: mapExpense(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error, "expenses.create");
  }
}
