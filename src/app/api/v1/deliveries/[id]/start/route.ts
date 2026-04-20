import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { startDelivery } from "@/modules/deliveries/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/deliveries/[id]/start — "جاهز" → "جاري التوصيل".
// Roles: driver (own), pm/gm/manager.
// Idempotency: 'required' — state transition must be idempotent.

export async function POST(request: Request, { params }: Params) {
  try {
    const claims = await requireRole(request, [
      "pm",
      "gm",
      "manager",
      "driver",
    ]);
    const { id } = await params;
    const deliveryId = Number(id);
    if (!Number.isFinite(deliveryId) || deliveryId < 1) {
      throw new ValidationError("معرِّف التوصيل غير صحيح");
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/deliveries/[id]/start",
        username: claims.username,
        body: { deliveryId },
        requireHeader: "required",
      },
      async (tx) => {
        const delivery = await startDelivery(tx, deliveryId, {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        });
        return { status: 200, body: { delivery } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
