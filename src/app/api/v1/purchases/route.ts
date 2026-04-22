import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { CreatePurchaseInput } from "@/modules/purchases/dto";
import { createPurchase } from "@/modules/purchases/service";

export const runtime = "nodejs";

// POST /api/v1/purchases — add purchase (weighted-avg update).
// Idempotency: 'optional' (recommended per 35_API_Endpoints, required not specified in D-16).

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const body = await request.json().catch(() => null);
    const parsed = CreatePurchaseInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/purchases",
        username: claims.username,
        userId: claims.userId,
        body: parsed.data,
        requireHeader: "optional",
      },
      async (tx) => {
        const purchase = await createPurchase(tx, parsed.data, {
          userId: claims.userId,
          username: claims.username,
        });
        return { status: 201, body: { purchase } };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
