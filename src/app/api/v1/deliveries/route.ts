import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { CreateDeliveryInput } from "@/modules/deliveries/dto";
import { createDelivery } from "@/modules/deliveries/service";

export const runtime = "nodejs";

// POST /api/v1/deliveries — create a delivery record from an order currently
// in status "جاهز". pm/gm/manager only (driver cannot create their own).
// Idempotency: 'optional' (matches POST /orders pattern; safe to retry).

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const body = await request.json().catch(() => null);
    const parsed = CreateDeliveryInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/deliveries",
        username: claims.username,
        userId: claims.userId,
        body: parsed.data,
        requireHeader: "optional",
      },
      async (tx) => {
        const delivery = await createDelivery(tx, parsed.data, {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        });
        return { status: 201, body: { delivery } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
