import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { SessionClaims } from "@/lib/session-claims";
import type { NavItem } from "@/modules/users/nav";

/**
 * App shell — wraps authenticated pages with sidebar + topbar.
 * Sidebar RTL uses border-l (visually on the left in RTL = the START edge).
 * Phase 5.1b: forwards `initialUnreadCount` (resolved SSR in (app)/layout.tsx)
 * to Topbar so the Bell badge is correct on first paint.
 */
export function AppLayout({
  claims,
  currentPath,
  navItems,
  initialUnreadCount,
  children,
}: {
  claims: SessionClaims;
  currentPath?: string;
  navItems: NavItem[];
  initialUnreadCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-row-reverse overflow-hidden">
      <Sidebar role={claims.role} items={navItems} currentPath={currentPath} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar claims={claims} initialUnreadCount={initialUnreadCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
