import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { CancelOrderInput } from "@/modules/orders/dto";
import { redactOrderForRole } from "@/modules/orders/redaction";
import { cancelOrder } from "@/modules/orders/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/orders/[id]/cancel — C1 transaction.
// Idempotency: 'required' (D-16 — cancel is in the mandatory-header list).

export async function POST(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "seller"]);
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId < 1) {
      throw new ValidationError("معرِّف الطلب غير صحيح");
    }
    const body = await request.json().catch(() => null);
    const parsed = CancelOrderInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/orders/[id]/cancel",
        username: claims.username,
        userId: claims.userId,
        body: { orderId, ...parsed.data },
        requireHeader: "required",
      },
      async (tx) => {
        const order = await cancelOrder(tx, orderId, parsed.data, {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        });
        return { status: 200, body: { order: redactOrderForRole(order, claims.role) } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
