import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { ListInvoicesQuery } from "@/modules/invoices/dto";
import { listInvoices } from "@/modules/invoices/service";

export const runtime = "nodejs";

// GET /api/v1/invoices — paginated invoice list with role-scoped filtering.
// Roles: pm/gm/manager (all), seller (own orders), driver (own deliveries).
// stock_keeper is blocked by requireRole — there's no legal path for them.

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, [
      "pm",
      "gm",
      "manager",
      "seller",
      "driver",
    ]);

    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ListInvoicesQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await withRead(undefined, (db) =>
      listInvoices(
        db,
        {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        },
        parsed.data,
      ),
    );
    return NextResponse.json({ invoices: result.rows, total: result.total });
  } catch (err) {
    return apiError(err);
  }
}
