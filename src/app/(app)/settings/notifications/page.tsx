import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionClaims } from "@/lib/session-claims";
import { withTxInRoute } from "@/db/client";
import { listPreferences } from "@/modules/notifications/service";
import { PageShell } from "@/components/ui/PageShell";
import { PreferencesFormClient } from "./PreferencesFormClient";

// Phase 5.1b — per-user notification preferences. Independent of the
// /settings admin page (which is pm/gm only): every authenticated role can
// manage their own 14 toggles.

export default async function NotificationPreferencesPage() {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");

  const prefs = await withTxInRoute(undefined, (tx) =>
    listPreferences(tx, {
      userId: claims.userId,
      username: claims.username,
      role: claims.role,
    }),
  );

  return (
    <PageShell
      title="تفضيلات الإشعارات"
      subtitle="تحكّم في الإشعارات التي تصلك (in_app فقط — D-22)"
      actions={
        <Link
          href="/notifications"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          عودة إلى قائمة الإشعارات
        </Link>
      }
    >
      <PreferencesFormClient initialPreferences={prefs} />
    </PageShell>
  );
}
