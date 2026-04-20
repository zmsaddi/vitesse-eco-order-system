import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { CreateOrderInput } from "@/modules/orders/dto";
import { redactOrderForRole } from "@/modules/orders/redaction";
import { createOrder } from "@/modules/orders/service";

export const runtime = "nodejs";

// POST /api/v1/orders — create order with multi-item payload.
// Idempotency: 'optional' (D-16 — orders POST is not mandatory but recommended).
// Roles: pm/gm/manager/seller (seller creates own orders).

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "seller"]);
    const body = await request.json().catch(() => null);
    const parsed = CreateOrderInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/orders",
        username: claims.username,
        body: parsed.data,
        requireHeader: "optional",
      },
      async (tx) => {
        const order = await createOrder(tx, parsed.data, {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        });
        return { status: 201, body: { order: redactOrderForRole(order, claims.role) } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
