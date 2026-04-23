import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionClaims } from "@/lib/session-claims";
import type { NotificationPreferenceDto } from "@/modules/notifications/dto";
import { PageShell } from "@/components/ui/PageShell";
import { PreferencesFormClient } from "./PreferencesFormClient";

// Phase 5.1b — per-user notification preferences. Independent of the
// /settings admin page (which is pm/gm only): every authenticated role can
// manage their own 14 toggles.
//
// Canonical fetch pattern: goes through GET /api/v1/notifications/preferences
// rather than importing `listPreferences` directly. The route handler
// lazy-seeds 14 rows on first access (ON CONFLICT DO NOTHING against the
// unique constraint shipped in 0012), so this page always renders a full
// matrix of toggles even on a brand-new account.

async function fetchPreferencesCanonically(): Promise<
  NotificationPreferenceDto[]
> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error(
      "settings/notifications page: cannot resolve host from incoming request",
    );
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();

  const res = await fetch(
    `${protocol}://${host}/api/v1/notifications/preferences`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/notifications/preferences → ${res.status}`);
  }
  const body = (await res.json()) as {
    preferences: NotificationPreferenceDto[];
  };
  return body.preferences;
}

export default async function NotificationPreferencesPage() {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");

  const prefs = await fetchPreferencesCanonically();

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
