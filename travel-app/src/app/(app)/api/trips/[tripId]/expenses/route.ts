import { expenseRequestSchema } from "@/features/budget/api-schemas";
import { createExpense } from "@/features/budget/services/expenses-api";
import { parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedSupabase, persistenceErrorResponse } from "@/lib/persistence/server";

export async function POST(request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    const { tripId } = await context.params;
    const parsed = await parseJsonBody(request, expenseRequestSchema, "Los datos del gasto no son válidos.");
    if (!parsed.ok) return parsed.response;
    const expense = await createExpense(supabase, user.id, tripId, parsed.data);
    if (expense === "ACTIVITY_NOT_OWNED") {
      return Response.json({ error: "La actividad relacionada no pertenece a este viaje o ya no existe." }, { status: 400 });
    }
    return Response.json({ expense }, { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error, "expenses.create");
  }
}
