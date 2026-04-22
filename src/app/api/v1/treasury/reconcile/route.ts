import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { ReconcileInput } from "@/modules/treasury/dto";
import { performReconcile } from "@/modules/treasury/service";

export const runtime = "nodejs";

// POST /api/v1/treasury/reconcile — pm/gm (any account) + manager (own
// manager_box only). Service enforces manager-ownership under FOR UPDATE.
// Compares physical / actual balance against expected RECOMPUTED from
// treasury_movements (source of truth) — never against cached
// treasury_accounts.balance. Idempotency-Key: required (D-79).

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager"]);
    const body = await request.json().catch(() => null);
    const parsed = ReconcileInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/treasury/reconcile",
        username: claims.username,
        userId: claims.userId,
        body: parsed.data,
        requireHeader: "required",
      },
      async (tx) => {
        const result = await performReconcile(tx, parsed.data, {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        });
        return { status: 200, body: result };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
