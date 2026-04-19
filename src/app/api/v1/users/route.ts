import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { requireRole } from "@/lib/session-claims";
import { apiError } from "@/lib/api-errors";
import { listActiveUsers } from "@/modules/users/service";

// GET /api/v1/users — list active users (PM/GM only per permissions matrix).
// Phase 2 MVP: list only. POST/PUT/delete-via-PUT{active:false} come in Phase 2b.

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["pm", "gm"]);
    const users = await withRead(undefined, (db) => listActiveUsers(db));
    return NextResponse.json({ users });
  } catch (err) {
    return apiError(err);
  }
}
