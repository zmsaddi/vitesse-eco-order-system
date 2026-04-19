import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { SessionClaims } from "@/lib/session-claims";

/**
 * App shell — wraps authenticated pages with sidebar + topbar.
 * Sidebar RTL uses border-l (visually on the left in RTL = the START edge).
 */
export function AppLayout({
  claims,
  currentPath,
  children,
}: {
  claims: SessionClaims;
  currentPath?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-row-reverse overflow-hidden">
      <Sidebar role={claims.role} currentPath={currentPath} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar claims={claims} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
