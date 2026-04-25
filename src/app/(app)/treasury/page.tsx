import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { PageShell } from "@/components/ui/PageShell";
import { ListTreasuryQuery } from "@/modules/treasury/dto";
import { listTreasury } from "@/modules/treasury/service";
import { TreasuryViewClient } from "./TreasuryViewClient";

// Phase 6.3 → UX Hotfix Pack T3 — Treasury snapshot (read-only).
// SSR reads via direct listTreasury() instead of a same-origin canonical
// fetch to /api/v1/treasury. Scope unchanged: pm/gm (all), manager (own box
// + own-team custodies), driver (own custody) — enforced inside the service.

type SP = { movementsLimit?: string; movementsOffset?: string };

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager", "driver"]);
  if (!claims) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  if (sp.movementsLimit) raw.movementsLimit = sp.movementsLimit;
  if (sp.movementsOffset) raw.movementsOffset = sp.movementsOffset;
  const parsed = ListTreasuryQuery.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : { movementsLimit: 100, movementsOffset: 0 };

  const data = await withRead(undefined, (db) =>
    listTreasury(
      db,
      {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      },
      query,
    ),
  );

  const titleForRole =
    claims.role === "manager"
      ? "صندوقي"
      : claims.role === "driver"
        ? "عهدتي"
        : "الصناديق";

  return (
    <PageShell
      title={titleForRole}
      subtitle={`${data.accounts.length} حساب · ${data.movementsTotal} حركة`}
    >
      <TreasuryViewClient
        accounts={data.accounts}
        movements={data.movements}
        movementsTotal={data.movementsTotal}
        query={query}
      />
    </PageShell>
  );
}
