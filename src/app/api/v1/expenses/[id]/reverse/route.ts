import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { ReverseExpenseInput } from "@/modules/expenses/dto";
import { reverseExpense } from "@/modules/expenses/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/expenses/[id]/reverse — D-82 structured reverse.
// Creates a NEW expense row with amount < 0 + reversal_of = original.id.
// Idempotency: 'required' — financial reversal must be strictly idempotent.

export async function POST(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const { id } = await params;
    const expenseId = Number(id);
    if (!Number.isFinite(expenseId) || expenseId < 1) {
      throw new ValidationError("معرِّف المصروف غير صحيح");
    }
    const body = await request.json().catch(() => null);
    const parsed = ReverseExpenseInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/expenses/[id]/reverse",
        username: claims.username,
        body: { expenseId, ...parsed.data },
        requireHeader: "required",
      },
      async (tx) => {
        const expense = await reverseExpense(tx, expenseId, parsed.data, {
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
