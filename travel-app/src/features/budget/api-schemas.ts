import type { SavedExpense } from "@/lib/persistence/types";
import { validateExpense } from "@/lib/persistence/validation";
import { schemaFromValidator } from "@/lib/api/http";

export const expenseRequestSchema = schemaFromValidator<Omit<SavedExpense, "id" | "tripId" | "createdAt">>(
  validateExpense,
  "Los datos del gasto no son válidos.",
);
