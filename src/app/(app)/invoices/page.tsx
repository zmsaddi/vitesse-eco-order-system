import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { PageShell } from "@/components/ui/PageShell";
import { ListInvoicesQuery } from "@/modules/invoices/dto";
import { listInvoices } from "@/modules/invoices/service";
import { InvoicesListClient } from "./InvoicesListClient";

// Phase 6.3 → UX Hotfix Pack T3 — Invoices list (read-only).
// SSR reads via direct listInvoices() instead of a same-origin canonical
// fetch to /api/v1/invoices. Scope unchanged: pm/gm/manager (all), seller
// (own orders), driver (own deliveries) — enforced inside the service.

type SP = {
  limit?: string;
  offset?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const claims = await enforcePageRole([
    "pm",
    "gm",
    "manager",
    "seller",
    "driver",
  ]);
  if (!claims) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  if (sp.limit) raw.limit = sp.limit;
  if (sp.offset) raw.offset = sp.offset;
  if (sp.dateFrom) raw.dateFrom = sp.dateFrom;
  if (sp.dateTo) raw.dateTo = sp.dateTo;
  if (sp.status) raw.status = sp.status;
  const parsed = ListInvoicesQuery.safeParse(raw);
  const query = parsed.success ? parsed.data : { limit: 50, offset: 0 };

  const result = await withRead(undefined, (db) =>
    listInvoices(
      db,
      {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
      },
      query,
    ),
  );

  return (
    <PageShell title="الفواتير" subtitle={`${result.total} فاتورة`}>
      <InvoicesListClient
        invoices={result.rows}
        total={result.total}
        query={query}
      />
    </PageShell>
  );
}
