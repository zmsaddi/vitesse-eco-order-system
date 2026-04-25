import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { SessionClaims } from "@/lib/session-claims";
import type { NavItem } from "@/modules/users/nav";

/**
 * App shell — wraps authenticated pages with sidebar + topbar.
 *
 * RTL layout: <html dir="rtl"> + plain `flex` (no row-reverse) flows
 * children inline-start → inline-end, which under RTL means visual
 * RIGHT → LEFT. Source order is { Sidebar, ContentColumn } → renders
 * { Sidebar on visual right, ContentColumn on visual left }. Sidebar's
 * `border-l` is the physical left edge of the element, which under that
 * placement is the inner edge that visually separates the sidebar from
 * the main content area.
 *
 * UX hotfix T1 (2026-04-25): dropped the prior `flex-row-reverse` trick
 * that was double-reversing under RTL and pushing the sidebar to the
 * visual LEFT.
 *
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={claims.role} items={navItems} currentPath={currentPath} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar claims={claims} initialUnreadCount={initialUnreadCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
