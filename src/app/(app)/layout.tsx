import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionClaims } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { getNavForRole } from "@/modules/users/nav";
import { Providers } from "@/app/providers";
import { countUnread } from "@/modules/notifications/service";

// Shared layout for all authenticated pages (inside (app) route group).
// Phase 2: Sidebar items come from `getNavForRole()` (same source as /api/v1/me).
// Phase 5.1b: wraps children in <Providers> (TanStack Query) and resolves the
// initial unread-count SSR so the bell badge renders correctly on first paint
// — no "zero then flip" flash on hydration.

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");

  const hdrs = await headers();
  const currentPath = hdrs.get("x-pathname") ?? undefined;
  const navItems = getNavForRole(claims.role);
  const initialUnreadCount = await withRead(undefined, (db) =>
    countUnread(db, claims.userId),
  );

  return (
    <Providers>
      <AppLayout
        claims={claims}
        currentPath={currentPath}
        navItems={navItems}
        initialUnreadCount={initialUnreadCount}
      >
        {children}
      </AppLayout>
    </Providers>
  );
}
