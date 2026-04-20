import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { ConfirmDeliveryInput } from "@/modules/deliveries/dto";
import { confirmDelivery } from "@/modules/deliveries/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/deliveries/[id]/confirm-delivery — "جاري التوصيل" → "تم التوصيل".
// Side effects inside the same tx:
//   - parent order → "مؤكد"
//   - driver_task → completed
//   - payments row (collection) if paidAmount > 0
//   - bonuses rows (per-item seller + one per-delivery driver)
// Roles: driver (assigned only), pm/gm/manager.
// Idempotency: 'required' — D-16 mandates it for the "collect" family.

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
    const body = await request.json().catch(() => null);
    const parsed = ConfirmDeliveryInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/deliveries/[id]/confirm-delivery",
        username: claims.username,
        body: { deliveryId, ...parsed.data },
        requireHeader: "required",
      },
      async (tx) => {
        const delivery = await confirmDelivery(tx, deliveryId, parsed.data, {
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
