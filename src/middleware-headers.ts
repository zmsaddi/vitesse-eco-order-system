// Pure header-building helper, extracted from src/middleware.ts for unit testing.
// The goal: preserve EVERY original request header (cookies, authorization, user-agent,
// accept-*, etc.) and add `x-pathname` so Server Components can read the current path.
//
// The earlier bug (Phase 2.1): `new Headers()` with NO args created an empty collection,
// then only x-pathname was set. This silently dropped all downstream headers —
// including Auth.js session cookies — from `request.headers` as seen by server code
// reached via `NextResponse.next({ request: { headers } })`.
//
// Keeping this logic in a separate file (no Next.js imports) makes it trivially
// unit-testable in vitest without booting any Next.js runtime.

export const PATHNAME_HEADER = "x-pathname";

/**
 * Copy all original request headers and add `x-pathname`.
 * If `x-pathname` was already set on the original request, it's overwritten with `path`.
 */
export function buildForwardHeaders(original: Headers, path: string): Headers {
  const out = new Headers(original);
  out.set(PATHNAME_HEADER, path);
  return out;
}
