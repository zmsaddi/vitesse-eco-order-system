import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { CreateExpenseInput } from "@/modules/expenses/dto";
import { createExpense, listExpenses } from "@/modules/expenses/service";

export const runtime = "nodejs";

// GET /api/v1/expenses — list with pagination.
// POST /api/v1/expenses — create expense (Idempotency-Key optional).

export async function GET(request: Request) {
  try {
    await requireRole(request, ["pm", "gm", "manager"]);
    const url = new URL(request.url);
    const limit = url.searchParams.has("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const offset = url.searchParams.has("offset")
      ? Number(url.searchParams.get("offset"))
      : undefined;
    const result = await withRead(undefined, (db) => listExpenses(db, { limit, offset }));
    return NextResponse.json({ expenses: result.rows, total: result.total });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const body = await request.json().catch(() => null);
    const parsed = CreateExpenseInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/expenses",
        username: claims.username,
        body: parsed.data,
        requireHeader: "optional",
      },
      async (tx) => {
        const expense = await createExpense(tx, parsed.data, {
          userId: claims.userId,
          username: claims.username,
        });
        return { status: 201, body: { expense } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
