import { signOut } from "@/auth";
import type { SessionClaims } from "@/lib/session-claims";
import { BellDropdown } from "./BellDropdown";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

async function logoutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/login" });
}

/**
 * Topbar with Bell dropdown (Phase 5.1b).
 * `initialUnreadCount` is resolved SSR in (app)/layout.tsx via
 * countUnread(db, claims.userId) so the badge is correct on first render.
 *
 * UX hotfix T1 (2026-04-25): removed the prior empty breadcrumb placeholder
 * div (a Phase 3 future-stub that left a dead gap on the visual left). The
 * four canonical actions now sit in source order { welcome, bell, theme,
 * sign-out } which under <html dir="rtl"> renders right-to-left as
 * "أهلاً … 🔔 🌙 [تسجيل الخروج]" — Arabic-natural reading order, no dead
 * space.
 */
export function Topbar({
  claims,
  initialUnreadCount,
}: {
  claims: SessionClaims;
  initialUnreadCount: number;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
      <span className="text-sm">
        أهلاً، <strong>{claims.name}</strong>
      </span>
      <BellDropdown initialUnreadCount={initialUnreadCount} />
      <ThemeToggle />
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          تسجيل الخروج
        </button>
      </form>
    </header>
  );
}
