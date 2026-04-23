import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import {
  DashboardQuery,
  type DashboardResponse,
} from "@/modules/dashboard/dto";
import { PageShell } from "@/components/ui/PageShell";
import { DashboardClient } from "./DashboardClient";

// Phase 5.3 — Dashboard page.
// Canonical fetch to /api/v1/dashboard (no direct service import).
// pm/gm see global numbers; manager sees team-scoped + null for netProfit/cashProfit.

type SP = {
  dateFrom?: string;
  dateTo?: string;
};

async function fetchDashboardCanonically(query: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<DashboardResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("dashboard page: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const sp = new URLSearchParams();
  if (query.dateFrom) sp.set("dateFrom", query.dateFrom);
  if (query.dateTo) sp.set("dateTo", query.dateTo);
  const qs = sp.toString();

  const res = await fetch(
    `${protocol}://${host}/api/v1/dashboard${qs ? `?${qs}` : ""}`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/dashboard → ${res.status}`);
  }
  return (await res.json()) as DashboardResponse;
}

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

  const initial = await fetchDashboardCanonically(query);

  return (
    <PageShell
      title={claims.role === "manager" ? "لوحتي" : "لوحة التحكم"}
      subtitle={`من ${initial.period.from} إلى ${initial.period.to}`}
    >
      <DashboardClient initialData={initial} role={claims.role} />
    </PageShell>
  );
}
