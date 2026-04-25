import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { PageShell } from "@/components/ui/PageShell";
import { ListDeliveriesQuery } from "@/modules/deliveries/dto";
import { listDeliveries } from "@/modules/deliveries/service";
import { DeliveriesListClient } from "./DeliveriesListClient";

// Phase 6.4 → UX Hotfix Pack T3 — Deliveries list (read-only).
// SSR reads via direct listDeliveries() instead of a same-origin canonical
// fetch to /api/v1/deliveries. Scope unchanged: pm/gm/manager see all,
// driver sees own only — enforced inside the service via the same Phase 4.0
// visibility helper the API route uses.

type SP = {
  limit?: string;
  offset?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedDriverId?: string;
};

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager", "driver"]);
  if (!claims) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  if (sp.limit) raw.limit = sp.limit;
  if (sp.offset) raw.offset = sp.offset;
  if (sp.status) raw.status = sp.status;
  if (sp.dateFrom) raw.dateFrom = sp.dateFrom;
  if (sp.dateTo) raw.dateTo = sp.dateTo;
  if (sp.assignedDriverId) raw.assignedDriverId = sp.assignedDriverId;
  const parsed = ListDeliveriesQuery.safeParse(raw);
  const query = parsed.success ? parsed.data : { limit: 50, offset: 0 };

  const result = await withRead(undefined, (db) =>
    listDeliveries(
      db,
      {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      },
      query,
    ),
  );

  const title = claims.role === "driver" ? "توصيلاتي" : "التوصيلات";

  return (
    <PageShell title={title} subtitle={`${result.total} توصيل`}>
      <DeliveriesListClient
        deliveries={result.rows}
        total={result.total}
        query={query}
        role={claims.role}
      />
    </PageShell>
  );
}
