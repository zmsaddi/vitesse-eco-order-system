import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { DashboardQuery } from "@/modules/dashboard/dto";
import { getDashboard } from "@/modules/dashboard/service";
import { PageShell } from "@/components/ui/PageShell";
import { DashboardClient } from "./DashboardClient";

// Phase 5.3 → UX Hotfix Pack T3 — Dashboard page.
// SSR reads via direct getDashboard() instead of a same-origin canonical
// fetch to /api/v1/dashboard. pm/gm see global numbers; manager sees
// team-scoped data with netProfit/cashProfit returned as null (gate stays
// in the service, not the page).

type SP = {
  dateFrom?: string;
  dateTo?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  if (!claims) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  if (sp.dateFrom) raw.dateFrom = sp.dateFrom;
  if (sp.dateTo) raw.dateTo = sp.dateTo;
  const parsed = DashboardQuery.safeParse(raw);
  const query = parsed.success ? parsed.data : {};

  const initial = await withRead(undefined, (db) =>
    getDashboard(db, query, {
      userId: claims.userId,
      username: claims.username,
      role: claims.role,
    }),
  );

  return (
    <PageShell
      title={claims.role === "manager" ? "لوحتي" : "لوحة التحكم"}
      subtitle={`من ${initial.period.from} إلى ${initial.period.to}`}
    >
      <DashboardClient initialData={initial} role={claims.role} />
    </PageShell>
  );
}
