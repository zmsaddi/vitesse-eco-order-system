import { signOut } from "@/auth";
import type { SessionClaims } from "@/lib/session-claims";

async function logoutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/login" });
}

/**
 * Phase 1 Topbar (minimal).
 * Bell dropdown (D-42) + breadcrumbs come in Phase 3 when notifications land.
 */
export function Topbar({ claims }: { claims: SessionClaims }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="text-sm text-gray-600 dark:text-gray-400">{/* breadcrumbs Phase 3 */}</div>

      <div className="flex items-center gap-4">
        <span className="text-sm">
          أهلاً، <strong>{claims.name}</strong>
        </span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            تسجيل الخروج
          </button>
        </form>
      </div>
    </header>
  );
}
