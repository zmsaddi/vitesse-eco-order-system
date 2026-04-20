import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { UpdateExpenseInput } from "@/modules/expenses/dto";
import { getExpenseById, updateExpense } from "@/modules/expenses/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/expenses/[id] — read one.
// PUT /api/v1/expenses/[id] — update. NO DELETE (D-04 / D-82).

export async function GET(request: Request, { params }: Params) {
  try {
    await requireRole(request, ["pm", "gm", "manager"]);
    const { id } = await params;
    const expenseId = Number(id);
    if (!Number.isFinite(expenseId) || expenseId < 1) {
      throw new ValidationError("معرِّف المصروف غير صحيح");
    }
    const expense = await withRead(undefined, (db) => getExpenseById(db, expenseId));
    return NextResponse.json({ expense });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const { id } = await params;
    const expenseId = Number(id);
    if (!Number.isFinite(expenseId) || expenseId < 1) {
      throw new ValidationError("معرِّف المصروف غير صحيح");
    }
    const body = await request.json().catch(() => null);
    const parsed = UpdateExpenseInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    return await withIdempotencyRoute(
      request,
      {
        endpoint: "PUT /api/v1/expenses/[id]",
        username: claims.username,
        body: { id: expenseId, ...parsed.data },
        requireHeader: "optional",
      },
      async (tx) => {
        const expense = await updateExpense(tx, expenseId, parsed.data, {
          userId: claims.userId,
          username: claims.username,
        });
        return { status: 200, body: { expense } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
