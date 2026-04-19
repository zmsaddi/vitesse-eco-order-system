// D-67: SessionClaims abstraction — web cookies today، bearer token ready for Android (Phase 5+).
// كل business route handler يستدعي getSessionClaims(request)، ليس auth() مباشرة.

export type Role =
  | "pm"
  | "gm"
  | "manager"
  | "seller"
  | "driver"
  | "stock_keeper";

export type SessionClaims = {
  userId: number;
  username: string;
  role: Role;
  name: string;
};

/**
 * Extract session claims from request.
 * Phase 0..5 (web-only): Auth.js cookie via auth().
 * Phase 5+ (Android): Authorization: Bearer <JWT> branch.
 *
 * Until Phase 1 adds Auth.js, returns null.
 */
export async function getSessionClaims(
  _request: Request,
): Promise<SessionClaims | null> {
  // Phase 0 stub — Phase 1 replaces with:
  //   const session = await auth();
  //   if (session?.user) return toClaims(session.user);
  //
  //   // Phase 5+ mobile branch:
  //   const bearer = _request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  //   if (bearer) return verifyJwtAndExtractClaims(bearer);

  return null;
}

/**
 * Type-safe claims assertion for route handlers.
 * Throws AuthError if claims missing.
 */
export async function requireClaims(request: Request): Promise<SessionClaims> {
  const claims = await getSessionClaims(request);
  if (!claims) {
    const { AuthError } = await import("./api-errors");
    throw new AuthError();
  }
  return claims;
}

/**
 * Require claims AND specific role(s). Throws PermissionError if role mismatch.
 */
export async function requireRole(
  request: Request,
  allowed: Role | Role[],
): Promise<SessionClaims> {
  const claims = await requireClaims(request);
  const allowedArr = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedArr.includes(claims.role)) {
    const { PermissionError } = await import("./api-errors");
    throw new PermissionError();
  }
  return claims;
}
