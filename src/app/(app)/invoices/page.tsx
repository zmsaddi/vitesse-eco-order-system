import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { PageShell } from "@/components/ui/PageShell";
import { ListInvoicesQuery, type InvoiceDto } from "@/modules/invoices/dto";
import { InvoicesListClient } from "./InvoicesListClient";

// Phase 6.3 — Invoices list page (read-only).
// Canonical fetch to /api/v1/invoices; zero direct service import.
// Roles: pm, gm, manager, seller, driver (matches backend). stock_keeper
// is redirected to /preparation by enforcePageRole.

type SP = {
  limit?: string;
  offset?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
};

type ListResponse = { invoices: InvoiceDto[]; total: number };

async function fetchInvoicesCanonically(query: {
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}): Promise<ListResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) throw new Error("invoices page: cannot resolve host");
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const sp = new URLSearchParams();
  if (query.limit !== undefined) sp.set("limit", String(query.limit));
  if (query.offset !== undefined) sp.set("offset", String(query.offset));
  if (query.dateFrom) sp.set("dateFrom", query.dateFrom);
  if (query.dateTo) sp.set("dateTo", query.dateTo);
  if (query.status) sp.set("status", query.status);
  const qs = sp.toString();

  const res = await fetch(
    `${protocol}://${host}/api/v1/invoices${qs ? `?${qs}` : ""}`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/invoices → ${res.status}`);
  }
  return (await res.json()) as ListResponse;
}

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

  const data = await fetchInvoicesCanonically(query);

  return (
    <PageShell title="الفواتير" subtitle={`${data.total} فاتورة`}>
      <InvoicesListClient
        invoices={data.invoices}
        total={data.total}
        query={query}
      />
    </PageShell>
  );
}
