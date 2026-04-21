import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import { TransferInput } from "@/modules/treasury/dto";
import { performTransfer } from "@/modules/treasury/service";

export const runtime = "nodejs";

// POST /api/v1/treasury/transfer — pm/gm only. Four allowed routes:
//   main_cash   → manager_box   (funding)
//   manager_box → main_cash     (manager_settlement)
//   main_cash   → main_bank     (bank_deposit)
//   main_bank   → main_cash     (bank_withdrawal)
// Category is server-inferred from (from.type, to.type).
// Idempotency-Key: required (D-79).

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const body = await request.json().catch(() => null);
    const parsed = TransferInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/treasury/transfer",
        username: claims.username,
        body: parsed.data,
        requireHeader: "required",
      },
      async (tx) => {
        const result = await performTransfer(tx, parsed.data, {
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
