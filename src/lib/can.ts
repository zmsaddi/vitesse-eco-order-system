import { and, eq } from "drizzle-orm";
import { withRead } from "@/db/client";
import { permissions } from "@/db/schema";
import type { Role } from "./session-claims";

// D-12: DB-driven permissions (not hardcoded in middleware).
// D-59: middleware uses JWT role; granular action checks via can() happen inside route handlers.
// 60s TTL cache keeps the common hot path at ~0 DB queries between permission updates.
// Invalidation hook: invalidatePermissionsCache() should fire on any permissions table mutation.

type CacheEntry = { allowed: boolean; expiresAt: number };

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function cacheKey(role: Role, resource: string, action: string): string {
  return `${role}:${resource}:${action}`;
}

/**
 * Check whether a role is allowed to perform an action on a resource.
 * Reads from DB with 60s cache. Default deny when no row exists.
 */
export async function can(role: Role, resource: string, action: string): Promise<boolean> {
  const key = cacheKey(role, resource, action);
  const now = Date.now();

  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached.allowed;

  const rows = await withRead(undefined, async (db) =>
    db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.role, role),
          eq(permissions.resource, resource),
          eq(permissions.action, action),
        ),
      )
      .limit(1),
  );

  const allowed = rows[0]?.allowed ?? false;
  CACHE.set(key, { allowed, expiresAt: now + TTL_MS });
  return allowed;
}

/**
 * Flush entire permissions cache. Call after any update to `permissions` table.
 */
export function invalidatePermissionsCache(): void {
  CACHE.clear();
}

/**
 * Testing helper: pre-seed the cache. Do NOT use in production code.
 */
export function __primeCacheForTesting(
  role: Role,
  resource: string,
  action: string,
  allowed: boolean,
): void {
  CACHE.set(cacheKey(role, resource, action), {
    allowed,
    expiresAt: Date.now() + TTL_MS,
  });
}
