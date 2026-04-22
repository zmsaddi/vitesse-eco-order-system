import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { redactOrderForRole } from "@/modules/orders/redaction";
import { markReady } from "@/modules/orders/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/orders/[id]/mark-ready — state transition قيد التحضير → جاهز.
// Roles: stock_keeper (main) + pm/gm/manager.
// Idempotency: 'required' — state transitions MUST be idempotent.

export async function POST(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, [
      "pm",
      "gm",
      "manager",
      "stock_keeper",
    ]);
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId < 1) {
      throw new ValidationError("معرِّف الطلب غير صحيح");
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/orders/[id]/mark-ready",
        username: claims.username,
        userId: claims.userId,
        body: { orderId },
        requireHeader: "required",
      },
      async (tx) => {
        const order = await markReady(tx, orderId, {
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
