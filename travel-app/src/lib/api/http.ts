import { z } from "zod";

export type ApiErrorCode = "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "PERSISTENCE_ERROR";

export function apiErrorResponse(message: string, status: number, code: ApiErrorCode = "VALIDATION_ERROR"): Response {
  return Response.json({ error: message, code }, { status });
}

export type JsonBodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  invalidJsonMessage: string,
): Promise<JsonBodyResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: apiErrorResponse(invalidJsonMessage, 400) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Los datos enviados no son válidos.";
    return { ok: false, response: apiErrorResponse(message, 400) };
  }
  return { ok: true, data: result.data };
}

export function schemaFromValidator<T>(validator: (input: unknown) => T | undefined, message: string): z.ZodType<T> {
  return z.unknown().transform((input, context) => {
    const parsed = validator(input);
    if (parsed !== undefined) return parsed;
    context.addIssue({ code: "custom", message });
    return z.NEVER;
  }) as z.ZodType<T>;
}
