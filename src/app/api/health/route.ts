import { NextResponse } from "next/server";

// Health probe — `/api/health` (NOT versioned per D-66 scope).
// Public — explicitly exempt from auth in src/middleware.ts.
//
// Response: { ok, timestamp, env }. No DB roundtrip (keep probe cheap).
// Moved from /api/v1/health → /api/health in Phase 1a to fix a probe that was
// being gated behind auth (middleware exempted /api/health but the endpoint lived at /api/v1/health).

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? "unknown",
  });
}
