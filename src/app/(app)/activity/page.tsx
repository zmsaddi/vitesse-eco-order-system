import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforcePageRole } from "@/lib/session-claims";
import {
  ListActivityQuery,
  type ListActivityResponse,
} from "@/modules/activity/dto";
import { PageShell } from "@/components/ui/PageShell";
import { ActivityListClient } from "./ActivityListClient";

// Phase 5.2 — Activity Explorer page.
// Canonical fetch through /api/v1/activity (no direct service import, per
// 5.1b lesson). pm/gm see the whole feed; manager sees self + linked drivers;
// other roles are redirected to their role-home by enforcePageRole.

type SP = {
  limit?: string;
  offset?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
};

async function fetchActivityCanonically(query: {
  limit: number;
  offset: number;
  entityType?: string;
  action?: string;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ListActivityResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("activity page: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const sp = new URLSearchParams();
  sp.set("limit", String(query.limit));
  sp.set("offset", String(query.offset));
  if (query.entityType) sp.set("entityType", query.entityType);
  if (query.action) sp.set("action", query.action);
  if (query.userId !== undefined) sp.set("userId", String(query.userId));
  if (query.dateFrom) sp.set("dateFrom", query.dateFrom);
  if (query.dateTo) sp.set("dateTo", query.dateTo);

  const res = await fetch(
    `${protocol}://${host}/api/v1/activity?${sp.toString()}`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/activity → ${res.status}`);
  }
  return (await res.json()) as ListActivityResponse;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const claims = await enforcePageRole(["pm", "gm", "manager"]);
  if (!claims) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  if (sp.limit) raw.limit = sp.limit;
  if (sp.offset) raw.offset = sp.offset;
  if (sp.entityType) raw.entityType = sp.entityType;
  if (sp.action) raw.action = sp.action;
  if (sp.userId) raw.userId = sp.userId;
  if (sp.dateFrom) raw.dateFrom = sp.dateFrom;
  if (sp.dateTo) raw.dateTo = sp.dateTo;
  const parsed = ListActivityQuery.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : { limit: 50, offset: 0 };

  const initial = await fetchActivityCanonically(query);

  return (
    <PageShell
      title="سجل النشاطات"
      subtitle={`${initial.total} سجل · مُرتَّب من الأحدث`}
    >
      <ActivityListClient
        initialQuery={query}
        initialData={initial}
        role={claims.role}
      />
    </PageShell>
  );
}
