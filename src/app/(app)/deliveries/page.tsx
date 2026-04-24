import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import { PageShell } from "@/components/ui/PageShell";
import {
  ListDeliveriesQuery,
  type DeliveryDto,
} from "@/modules/deliveries/dto";
import { DeliveriesListClient } from "./DeliveriesListClient";

// Phase 6.4 — Deliveries list page (read-only).
// Canonical fetch to /api/v1/deliveries; zero direct service import.
// Roles: pm, gm, manager, driver (matches backend). seller + stock_keeper
// redirected to role-home by enforcePageRole.

type SP = {
  limit?: string;
  offset?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedDriverId?: string;
};

type ListResponse = { deliveries: DeliveryDto[]; total: number };

async function fetchDeliveriesCanonically(query: {
  limit?: number;
  offset?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedDriverId?: number;
}): Promise<ListResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) throw new Error("deliveries page: cannot resolve host");
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const sp = new URLSearchParams();
  if (query.limit !== undefined) sp.set("limit", String(query.limit));
  if (query.offset !== undefined) sp.set("offset", String(query.offset));
  if (query.status) sp.set("status", query.status);
  if (query.dateFrom) sp.set("dateFrom", query.dateFrom);
  if (query.dateTo) sp.set("dateTo", query.dateTo);
  if (query.assignedDriverId !== undefined) {
    sp.set("assignedDriverId", String(query.assignedDriverId));
  }
  const qs = sp.toString();

  const res = await fetch(
    `${protocol}://${host}/api/v1/deliveries${qs ? `?${qs}` : ""}`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/deliveries → ${res.status}`);
  }
  return (await res.json()) as ListResponse;
}

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

  const data = await fetchDeliveriesCanonically(query);

  const title = claims.role === "driver" ? "توصيلاتي" : "التوصيلات";

  return (
    <PageShell title={title} subtitle={`${data.total} توصيل`}>
      <DeliveriesListClient
        deliveries={data.deliveries}
        total={data.total}
        query={query}
        role={claims.role}
      />
    </PageShell>
  );
}
