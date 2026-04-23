import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionClaims } from "@/lib/session-claims";
import {
  ListNotificationsQuery,
  type ListNotificationsResponse,
} from "@/modules/notifications/dto";
import { PageShell } from "@/components/ui/PageShell";
import { NotificationsListClient } from "./NotificationsListClient";

// Phase 5.1b — full notifications list page. All authenticated roles can
// access their own inbox; the route handler enforces user_id = claims.userId.
//
// Canonical fetch pattern (same as /my-bonus/page.tsx): the page goes through
// the HTTP route handler /api/v1/notifications rather than importing
// `listNotifications` directly. This keeps the page thin, guarantees it sees
// the exact shape an external client would see, and closes the drift risk a
// direct service import opens on the next API-side edit (auth middleware,
// rate limits, observability, X-Unread-Count header all attach at the
// route layer).

type SP = {
  limit?: string;
  offset?: string;
  type?: string;
  unread?: string;
};

async function fetchNotificationsCanonically(query: {
  limit: number;
  offset: number;
  type?: string;
  unread?: boolean;
}): Promise<ListNotificationsResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("notifications page: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const sp = new URLSearchParams();
  sp.set("limit", String(query.limit));
  sp.set("offset", String(query.offset));
  if (query.type !== undefined) sp.set("type", query.type);
  if (query.unread === true) sp.set("unread", "true");

  const res = await fetch(
    `${protocol}://${host}/api/v1/notifications?${sp.toString()}`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/notifications → ${res.status}`);
  }
  return (await res.json()) as ListNotificationsResponse;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");

  const sp = await searchParams;
  const raw: Record<string, string> = {};
  if (sp.limit) raw.limit = sp.limit;
  if (sp.offset) raw.offset = sp.offset;
  if (sp.type) raw.type = sp.type;
  if (sp.unread) raw.unread = sp.unread;
  const parsed = ListNotificationsQuery.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : { limit: 50, offset: 0, type: undefined, unread: undefined };

  const initial = await fetchNotificationsCanonically(query);

  return (
    <PageShell
      title="الإشعارات"
      subtitle={`الكل (${initial.total}) · غير مقروء (${initial.unreadCount})`}
      actions={
        <Link
          href="/settings/notifications"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          تفضيلات الإشعارات
        </Link>
      }
    >
      <NotificationsListClient initialQuery={query} initialData={initial} />
    </PageShell>
  );
}
