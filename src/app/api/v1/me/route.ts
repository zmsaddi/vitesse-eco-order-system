import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireClaims } from "@/lib/session-claims";
import { apiError } from "@/lib/api-errors";
import { getUserById } from "@/modules/users/service";
import { getNavForRole } from "@/modules/users/nav";

// GET /api/v1/me — first /api/v1/ business endpoint (D-66).
// Returns current user's claims + DTO + nav items (same source as SSR layout).
// This endpoint is the canonical "who am I, what can I see" call for any
// future Android client (D-67 bearer-token path).

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const claims = await requireClaims(request);
    const user = await withRead(undefined, (db) => getUserById(db, claims.userId));

    return NextResponse.json({
      claims: {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
        name: claims.name,
      },
      user,
      nav: getNavForRole(claims.role),
    });
  } catch (err) {
    return apiError(err);
  }
}
