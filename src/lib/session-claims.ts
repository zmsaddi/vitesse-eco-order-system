import { auth } from "@/auth";
import { AuthError, PermissionError } from "./api-errors";

// D-67: SessionClaims abstraction.
// - Today: Auth.js v5 cookie (web).
// - Phase 5+ (Android): Authorization: Bearer <JWT> branch added here; routes don't change.

export type Role =
  | "pm"
  | "gm"
  | "manager"
  | "seller"
  | "driver"
  | "stock_keeper";

export const ALL_ROLES: readonly Role[] = [
  "pm",
  "gm",
  "manager",
  "seller",
  "driver",
  "stock_keeper",
] as const;

export type SessionClaims = {
  userId: number;
  username: string;
  role: Role;
  name: string;
};

/**
 * Extract session claims from a Request.
 * Returns null when no valid session (caller decides 401 vs 403 vs redirect).
 *
 * @param _request — kept for future mobile bearer-token branch (unused for web cookies).
 */
export async function getSessionClaims(
  _request?: Request,
): Promise<SessionClaims | null> {
  const session = await auth();
  if (!session?.user) return null;

  const u = session.user as {
    id?: string;
    username?: string;
    role?: Role;
    name?: string | null;
  };
  if (!u.id || !u.username || !u.role) return null;

  return {
    userId: Number(u.id),
    username: u.username,
    role: u.role,
    name: u.name ?? u.username,
  };

  // Phase 5+ mobile branch (commented until Android client lands):
  // const bearer = _request?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  // if (bearer) return verifyJwtAndExtractClaims(bearer);
}

/**
 * Type-safe claims assertion for route handlers. Throws AuthError if missing.
 */
export async function requireClaims(request?: Request): Promise<SessionClaims> {
  const claims = await getSessionClaims(request);
  if (!claims) throw new AuthError();
  return claims;
}

/**
 * Require claims AND specific role(s). Throws PermissionError if role mismatch.
 * Use this in **API route handlers** — `apiError()` catches the throw and returns 401/403 JSON.
 */
export async function requireRole(
  request: Request | undefined,
  allowed: Role | Role[],
): Promise<SessionClaims> {
  const claims = await requireClaims(request);
  const allowedArr = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedArr.includes(claims.role)) throw new PermissionError();
  return claims;
}

// D-72 role-home map — must stay in sync with src/middleware.ts ROLE_HOMES.
// (Kept local here because middleware is Edge-safe and can't import from here directly,
// but pages import here.)
const ROLE_HOMES: Record<Role, string> = {
  pm: "/action-hub",
  gm: "/action-hub",
  manager: "/action-hub",
  seller: "/orders",
  driver: "/driver-tasks",
  stock_keeper: "/preparation",
};

/**
 * Page-level role enforcement for Server Components.
 *
 * Behavior:
 *   - No session           → redirect to /login (by re-using middleware's redirect pattern
 *                            — middleware would normally catch this first, but this is
 *                            defense-in-depth for cases middleware doesn't match).
 *   - Wrong role           → redirect to the user's role-home (D-72).
 *   - Allowed role         → returns claims.
 *
 * Unlike requireRole(), this does NOT throw. Pages that call it never land on
 * Next.js's unhandled-error page — they redirect cleanly.
 */
export async function enforcePageRole(
  allowed: Role | Role[],
): Promise<SessionClaims> {
  // Lazy-import next/navigation; redirect() throws a NEXT_REDIRECT sentinel that
  // Next.js catches. Extract as a standalone `never`-returning function so
  // TypeScript narrows `claims` after each call site.
  const { redirect: navRedirect } = (await import("next/navigation")) as {
    redirect: (url: string) => never;
  };
  const redirect: (url: string) => never = navRedirect;

  const claims = await getSessionClaims();
  if (!claims) redirect("/login"); // never returns
  const c = claims as SessionClaims; // narrowed past null by the redirect above

  const allowedArr = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedArr.includes(c.role)) redirect(ROLE_HOMES[c.role]); // never returns

  return c;
}
