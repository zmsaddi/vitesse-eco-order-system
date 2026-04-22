import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { withIdempotencyRoute } from "@/lib/idempotency";
import {
  CreateSettlementInput,
  ListSettlementsQuery,
} from "@/modules/settlements/dto";
import {
  listSettlements,
  performCreateSettlement,
} from "@/modules/settlements/service";

export const runtime = "nodejs";

// GET /api/v1/settlements — pm/gm only (list + paginate).
// POST /api/v1/settlements — pm/gm only, Idempotency-Key required.
// Body is a discriminated union on `kind`:
//   { kind: "settlement", userId, bonusIds, fromAccountId, paymentMethod, notes? }
//   { kind: "reward",     userId, amount,    fromAccountId, paymentMethod, notes? }

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ListSettlementsQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const out = await withRead(undefined, (db) =>
      listSettlements(db, parsed.data, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return NextResponse.json(out);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm"]);
    const body = await request.json().catch(() => null);
    const parsed = CreateSettlementInput.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("البيانات المدخلة غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    return await withIdempotencyRoute(
      request,
      {
        endpoint: "POST /api/v1/settlements",
        username: claims.username,
        userId: claims.userId,
        body: parsed.data,
        requireHeader: "required",
      },
      async (tx) => {
        const out = await performCreateSettlement(tx, parsed.data, {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        });
        return { status: 200, body: out };
      },
    );
  } catch (err) {
    return apiError(err);
  }
}
