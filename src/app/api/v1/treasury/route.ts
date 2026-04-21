import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { ListTreasuryQuery } from "@/modules/treasury/dto";
import { listTreasury } from "@/modules/treasury/service";

export const runtime = "nodejs";

// GET /api/v1/treasury — balance + movement snapshot, role-scoped.
// Roles: pm/gm (all), manager (own box + own-team custodies), driver (own custody).
// seller + stock_keeper blocked at requireRole.

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "manager", "driver"]);
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ListTreasuryQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const snapshot = await withRead(undefined, (db) =>
      listTreasury(
        db,
        {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        },
        parsed.data,
      ),
    );
    return NextResponse.json(snapshot);
  } catch (err) {
    return apiError(err);
  }
}
