import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { ReversePurchaseInput } from "@/modules/purchases/dto";
import { reversePurchase } from "@/modules/purchases/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/purchases/[id]/reverse — C5 reverse (refund cash or supplier credit).
// Idempotency: 'required' — financial reversal must never double-apply on retries.

export async function POST(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const { id } = await params;
    const purchaseId = Number(id);
    if (!Number.isFinite(purchaseId) || purchaseId < 1) {
      throw new ValidationError("معرِّف المشترى غير صحيح");
    }
    const body = await request.json().catch(() => null);
    const parsed = ReversePurchaseInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/purchases/[id]/reverse",
        username: claims.username,
        userId: claims.userId,
        body: { purchaseId, ...parsed.data },
        requireHeader: "required",
      },
      async (tx) => {
        const purchase = await reversePurchase(tx, purchaseId, parsed.data, {
          userId: claims.userId,
          username: claims.username,
        });
        return { status: 200, body: { purchase } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
