import { persistenceErrorResponse, getAuthenticatedSupabase } from "@/lib/persistence/server";
import { validateExpense } from "@/lib/persistence/validation";
import type { Currency } from "@/lib/types";

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

export async function PATCH(request: Request, context: { params: Promise<{ tripId: string; expenseId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId, expenseId } = await context.params;
    const expense = validateExpense(await request.json().catch(() => null));
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
      .update({
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        incurred_on: expense.incurredOn,
        notes: expense.notes ?? "",
        activity_id: expense.activityId ?? null,
      })
      .eq("trip_id", tripId)
      .eq("id", expenseId)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el gasto o no tienes permiso para modificarlo." }, { status: 404 });
    return Response.json({ expense: mapExpense(data as Record<string, unknown>) });
  } catch (error) {
    return persistenceErrorResponse(error, "expenses.update");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tripId: string; expenseId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId, expenseId } = await context.params;
    const { data, error } = await supabase
      .from("expenses")
      .delete()
      .eq("trip_id", tripId)
      .eq("id", expenseId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "No se encontró el gasto o no tienes permiso para eliminarlo." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return persistenceErrorResponse(error, "expenses.delete");
  }
}
