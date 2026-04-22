import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError, ValidationError } from "@/lib/api-errors";
import { jsonWithUnreadCount } from "@/lib/unread-count-header";
import { ListBonusesQuery } from "@/modules/settlements/dto";
import { listBonuses } from "@/modules/settlements/service";

export const runtime = "nodejs";

// GET /api/v1/bonuses — role-scoped listing + summary.
//   pm, gm             → full audit (may filter via userId query)
//   seller, driver     → own only (userId query param ignored — forced to caller)
//   manager            → 403 (team-leak prevention, Phase 4.4 scope)
//   stock_keeper       → 403
// Response shape: { items: BonusDto[], summary: BonusesSummaryDto }.

export async function GET(request: Request) {
  try {
    const claims = await requireRole(request, ["pm", "gm", "seller", "driver"]);
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = ListBonusesQuery.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError("معاملات البحث غير صحيحة.", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const out = await withRead(undefined, (db) =>
      listBonuses(db, parsed.data, {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      }),
    );
    return await jsonWithUnreadCount(out, 200, claims.userId);
  } catch (err) {
    return apiError(err);
  }
}
