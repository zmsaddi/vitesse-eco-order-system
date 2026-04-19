import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionClaims } from "@/lib/session-claims";
import { AppLayout } from "@/components/layout/AppLayout";
import { getNavForRole } from "@/modules/users/nav";

// Shared layout for all authenticated pages (inside (app) route group).
// Phase 2: Sidebar items come from `getNavForRole()` (same source as /api/v1/me),
// so UI and API share one source of truth.

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

  return (
    <AppLayout claims={claims} currentPath={currentPath} navItems={navItems}>
      {children}
    </AppLayout>
  );
}
