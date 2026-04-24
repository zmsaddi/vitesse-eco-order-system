import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./auth.config";
import { buildForwardHeaders } from "./middleware-headers";
import { isPublicMiddlewarePath } from "./middleware-public";
import type { Role } from "./lib/session-claims";

// D-59: middleware reads role from JWT — NO DB access (keeps invocation < 10ms).
// Granular resource/action checks happen inside route handlers via can() helper.
// This layer only enforces coarse-grained gates: auth required? role allowed?

const { auth: authMiddleware } = NextAuth(authConfig);

// Role-based home redirect (D-72): operational roles → task-first; admin → action-hub.
const ROLE_HOMES: Record<Role, string> = {
  pm: "/action-hub",
  gm: "/action-hub",
  manager: "/action-hub",
  seller: "/orders",
  driver: "/driver-tasks",
  stock_keeper: "/preparation",
};

// Forward request with `x-pathname` header so Server Components can read the
// current path via next/headers (used by AppLayout → Sidebar for active-link highlight).
//
// CRITICAL: `buildForwardHeaders` COPIES all original headers first (cookies, auth,
// user-agent, accept-*, etc.) then adds x-pathname. Phase 2.1 had a regression where
// Headers() was empty — dropping Auth.js session cookies + everything else. Phase 2.1.1
// fixes it + adds unit tests in middleware-headers.test.ts.
function nextWithPath(req: NextRequest, path: string): NextResponse {
  return NextResponse.next({
    request: { headers: buildForwardHeaders(req.headers, path) },
  });
}

export default authMiddleware((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  // Allow public paths through (still propagate x-pathname for consistency).
  if (isPublicMiddlewarePath(path)) {
    return nextWithPath(req, path);
  }

  // All other routes require auth.
  const claims = req.auth;
  if (!claims) {
    // UI route → redirect to login. API route → 401 JSON.
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "غير مصرح — سجّل دخولك مجددًا", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // D-72: root redirect to role home
  if (path === "/") {
    const role = (claims.user as { role?: Role }).role;
    if (role && role in ROLE_HOMES) {
      return NextResponse.redirect(new URL(ROLE_HOMES[role], nextUrl.origin));
    }
  }

  return nextWithPath(req, path);
});

export const config = {
  // Skip /api/auth/* too — NextAuth's handler sets its own csrf cookies, and the
  // middleware's auth() wrapper would emit a second Set-Cookie, duplicating
  // __Host-authjs.csrf-token and breaking credential POSTs with MissingCSRF.
  // Installability assets stay public to avoid manifest/sw/icon redirects on /login.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|icons/|manifest\\.webmanifest|sw\\.js|api/auth/).*)"],
};
