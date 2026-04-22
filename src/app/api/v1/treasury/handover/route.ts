import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { HandoverInput } from "@/modules/treasury/dto";
import { performHandover } from "@/modules/treasury/service";

export const runtime = "nodejs";

// POST /api/v1/treasury/handover — driver_custody → manager_box only.
// Roles: driver (تسليم), manager (استلام لسائق تابع له).
// Idempotency: 'required' (D-16/D-79 — money-changing endpoint).
//
// Body:
//   { amount: number, driverUserId?: number, notes?: string }
//
//   * driver caller: driverUserId ignored; handover is always from own custody.
//   * manager caller: driverUserId required; enforced server-side that
//     drv.manager_id === manager.userId.

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["driver", "manager"]);
    const body = await request.json().catch(() => null);
    const parsed = HandoverInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/treasury/handover",
        username: claims.username,
        userId: claims.userId,
        body: parsed.data,
        requireHeader: "required",
      },
      async (tx) => {
        const result = await performHandover(tx, parsed.data, {
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
