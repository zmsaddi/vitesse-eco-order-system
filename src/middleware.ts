import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import type { Role } from "./lib/session-claims";

// D-59: middleware reads role from JWT — NO DB access (keeps invocation < 10ms).
// Granular resource/action checks happen inside route handlers via can() helper.
// This layer only enforces coarse-grained gates: auth required? role allowed?

const { auth: authMiddleware } = NextAuth(authConfig);

// Public routes — no auth required.
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",        // Auth.js endpoints (login, callback, session) — D-66 not versioned
  "/api/health",      // Probe — D-66 not versioned
  "/api/init",        // First-run setup — D-24 (rejects in production after first use)
];

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
// Next.js does not expose the request pathname to RSC by default; this is the standard
// middleware pattern for it.
function nextWithPath(path: string): NextResponse {
  const requestHeaders = new Headers();
  requestHeaders.set("x-pathname", path);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default authMiddleware((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  // Allow public paths through (still propagate x-pathname for consistency).
  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return nextWithPath(path);
  }

  // All other routes require auth.
  const claims = req.auth;
  if (!claims) {
    // UI route → redirect to login. API route → 401 JSON.
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "غير مصرح — سجّل دخولك مجدداً", code: "UNAUTHORIZED" },
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

  return nextWithPath(path);
});

export const config = {
  // Run on everything except Next.js internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
