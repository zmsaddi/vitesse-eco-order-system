import { NextResponse } from "next/server";

// Health probe — NOT versioned per D-66 scope, but placed under /api/v1/ for now
// as a reachability smoke test. Phase 4 moves to /api/health (non-versioned root).
//
// Response: { ok, timestamp, env }. No DB roundtrip in Phase 0.

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? "unknown",
  });
}
