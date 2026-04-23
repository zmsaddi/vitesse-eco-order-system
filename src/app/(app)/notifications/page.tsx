import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionClaims } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { listNotifications } from "@/modules/notifications/service";
import { ListNotificationsQuery } from "@/modules/notifications/dto";
import { PageShell } from "@/components/ui/PageShell";
import { NotificationsListClient } from "./NotificationsListClient";

// Phase 5.1b — full notifications list page. All authenticated roles can
// access their own inbox; service layer enforces user_id = claims.userId.

type SP = {
  limit?: string;
  offset?: string;
  type?: string;
  unread?: string;
};

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

  const initial = await withRead(undefined, (db) =>
    listNotifications(db, query, {
      userId: claims.userId,
      username: claims.username,
      role: claims.role,
    }),
  );

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
