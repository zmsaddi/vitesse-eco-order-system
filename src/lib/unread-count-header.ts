import { NextResponse } from "next/server";
import { withRead } from "@/db/client";
import { countUnread } from "@/modules/notifications/service";

// Phase 5.1 — `X-Unread-Count` header helper (D-42).
//
// The badge count is attached to every authenticated API response so the
// UI's bell badge refreshes on every interaction — no separate polling
// loop (D-41: SSE removed; polling-only, on-demand).
//
// Performance:
//   - A tiny in-memory TTL cache (5 s per userId) fronts the COUNT query.
//     On a single Fluid Compute instance this collapses N+1 COUNTs under
//     burst traffic; on cold-start or after TTL expiry, a single SELECT
//     COUNT(*) against an indexed `(user_id, read_at IS NULL)` path runs.
//   - The cache is busted explicitly by `bustUnreadCountCache(userId)`
//     called from mark-read / mark-all-read / emitNotifications code paths
//     that mutate the set. (See notifications/service.ts + events.ts.)
//
// Safety:
//   - If `countUnread` throws (DB transient), we swallow the error and
//     emit the response without the header rather than 500 an otherwise-
//     successful request. The badge will refresh on the next tick.

type CacheEntry = { value: number; expiresAt: number };
const TTL_MS = 5_000;
const cache = new Map<number, CacheEntry>();

export function bustUnreadCountCache(userId: number): void {
  cache.delete(userId);
}

async function getCachedUnreadCount(userId: number): Promise<number> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await withRead(undefined, (db) => countUnread(db, userId));
  cache.set(userId, { value, expiresAt: now + TTL_MS });
  return value;
}

/**
 * Attach the `X-Unread-Count` header to an existing `NextResponse`. Mutates
 * the response's headers in place and returns it for chaining convenience.
 * Accepts a nullable userId so routes that somehow lack auth context don't
 * crash — they simply skip the header.
 */
export async function withUnreadCountHeader(
  response: NextResponse,
  userId: number | null | undefined,
): Promise<NextResponse> {
  if (typeof userId !== "number" || userId < 1) return response;
  try {
    const count = await getCachedUnreadCount(userId);
    response.headers.set("X-Unread-Count", String(count));
  } catch {
    // Swallow — request itself already succeeded.
  }
  return response;
}

/**
 * Convenience: build a JSON response AND attach the header in one call. Use
 * this anywhere a route handler would normally write
 *   `return NextResponse.json(body, { status })`.
 */
export async function jsonWithUnreadCount<T>(
  body: T,
  status: number,
  userId: number | null | undefined,
): Promise<NextResponse> {
  const res = NextResponse.json(body, { status });
  return withUnreadCountHeader(res, userId);
}

// Testing hook — lets integration suites reset the in-memory cache between
// test cases without exposing internals to production callers.
export function resetUnreadCountCacheForTesting(): void {
  cache.clear();
}
