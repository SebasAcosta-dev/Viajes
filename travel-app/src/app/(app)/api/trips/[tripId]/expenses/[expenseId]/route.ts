import { expenseRequestSchema } from "@/features/budget/api-schemas";
import { deleteExpense, updateExpense } from "@/features/budget/services/expenses-api";
import { parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";

export async function PATCH(request: Request, context: { params: Promise<{ tripId: string; expenseId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId, expenseId } = await context.params;
    const parsed = await parseJsonBody(request, expenseRequestSchema, "Los datos del gasto no son válidos.");
    if (!parsed.ok) return parsed.response;
    const expense = await updateExpense(supabase, user.id, tripId, expenseId, parsed.data);
    if (expense === "ACTIVITY_NOT_OWNED") {
      return Response.json({ error: "La actividad relacionada no pertenece a este viaje o ya no existe." }, { status: 400 });
    }
    if (!expense) return Response.json({ error: "No se encontró el gasto o no tienes permiso para modificarlo." }, { status: 404 });
    return Response.json({ expense });
  } catch (error) {
    return persistenceErrorResponse(error, "expenses.update");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tripId: string; expenseId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId, expenseId } = await context.params;
    const deleted = await deleteExpense(supabase, user.id, tripId, expenseId);
    if (!deleted) return Response.json({ error: "No se encontró el gasto o no tienes permiso para eliminarlo." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return persistenceErrorResponse(error, "expenses.delete");
  }
}
