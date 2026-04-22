import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbHandle, DbTx } from "@/db/client";
import { notificationPreferences, notifications } from "@/db/schema";
import { BusinessRuleError, NotFoundError } from "@/lib/api-errors";
import { bustUnreadCountCache } from "@/lib/unread-count-header";
import {
  NOTIFICATION_TYPES,
  type ListNotificationsQuery,
  type ListNotificationsResponse,
  type NotificationDto,
  type NotificationPreferenceDto,
  type NotificationType,
  type UpdatePreferencesInput,
} from "./dto";
import {
  notificationRowToDto,
  preferenceRowToDto,
} from "./mappers";
import type { NotificationClaims } from "./permissions";

// Phase 5.1 — notifications read + mutate service.
//
// Every function forces `user_id = claims.userId` — no cross-user access.
// Preferences are lazy-seeded on first GET: if the user has zero rows, we
// insert 14 rows (one per notification_type, channel='in_app', enabled=true)
// under a single tx so the seed is atomic.

export async function listNotifications(
  db: DbHandle | DbTx,
  query: ListNotificationsQuery,
  claims: NotificationClaims,
): Promise<ListNotificationsResponse> {
  const filters = [eq(notifications.userId, claims.userId)];
  if (query.type !== undefined) filters.push(eq(notifications.type, query.type));
  if (query.unread === true) filters.push(isNull(notifications.readAt));
  const where = and(...filters);

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.id))
    .limit(query.limit)
    .offset(query.offset);

  const totalRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(notifications)
    .where(where);
  const total = Number(totalRes[0]?.n ?? 0);

  const unreadRes = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, claims.userId),
        isNull(notifications.readAt),
      ),
    );
  const unreadCount = Number(unreadRes[0]?.n ?? 0);

  return {
    items: rows.map(notificationRowToDto),
    total,
    unreadCount,
  };
}

/**
 * Count unread notifications for a single user — optimised single-query
 * used by the X-Unread-Count header wrapper. Cached at caller level with
 * a short TTL to avoid N queries per second.
 */
export async function countUnread(
  db: DbHandle | DbTx,
  userId: number,
): Promise<number> {
  const res = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return Number(res[0]?.n ?? 0);
}

export async function markRead(
  tx: DbTx,
  notificationId: number,
  claims: NotificationClaims,
): Promise<NotificationDto> {
  const rows = await tx
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .limit(1);
  if (rows.length === 0) {
    throw new NotFoundError(`الإشعار رقم ${notificationId}`);
  }
  const row = rows[0];
  if (row.userId !== claims.userId) {
    throw new BusinessRuleError(
      "هذا الإشعار لا يخصّك.",
      "NOTIFICATION_NOT_OWNER",
      403,
      "markRead: notification.user_id !== claims.userId",
      { notificationId, ownerUserId: row.userId, callerUserId: claims.userId },
    );
  }

  if (row.readAt) {
    // Already read — idempotent. Return the current row unchanged.
    return notificationRowToDto(row);
  }

  const now = new Date();
  const updated = await tx
    .update(notifications)
    .set({ readAt: now })
    .where(eq(notifications.id, notificationId))
    .returning();
  bustUnreadCountCache(claims.userId);
  return notificationRowToDto(updated[0]);
}

export async function markAllRead(
  tx: DbTx,
  claims: NotificationClaims,
): Promise<{ updatedCount: number }> {
  const now = new Date();
  const res = await tx
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.userId, claims.userId),
        isNull(notifications.readAt),
      ),
    );
  const updatedCount = (res as unknown as { rowCount?: number }).rowCount ?? 0;
  bustUnreadCountCache(claims.userId);
  return { updatedCount };
}

/**
 * List preferences — lazy-seeds 14 rows on first call (one per known type).
 * Idempotent under concurrency: the insert targets the
 * notification_preferences_user_type_channel_unique constraint with
 * ON CONFLICT DO NOTHING, so two concurrent first-time GETs for the same
 * user both see a complete set afterwards without producing duplicates.
 */
export async function listPreferences(
  tx: DbTx,
  claims: NotificationClaims,
): Promise<NotificationPreferenceDto[]> {
  const seedRows = NOTIFICATION_TYPES.map((t) => ({
    userId: claims.userId,
    notificationType: t as NotificationType,
    channel: "in_app" as const,
    enabled: true,
  }));
  await tx
    .insert(notificationPreferences)
    .values(seedRows)
    .onConflictDoNothing({
      target: [
        notificationPreferences.userId,
        notificationPreferences.notificationType,
        notificationPreferences.channel,
      ],
    });

  const full = await tx
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, claims.userId));

  return full.map(preferenceRowToDto);
}

export async function updatePreferences(
  tx: DbTx,
  input: UpdatePreferencesInput,
  claims: NotificationClaims,
): Promise<NotificationPreferenceDto[]> {
  // Ensure rows exist (lazy-seed if this is the first interaction).
  await listPreferences(tx, claims);

  for (const u of input.updates) {
    await tx
      .update(notificationPreferences)
      .set({ enabled: u.enabled })
      .where(
        and(
          eq(notificationPreferences.userId, claims.userId),
          eq(notificationPreferences.notificationType, u.notificationType),
          eq(notificationPreferences.channel, "in_app"),
        ),
      );
  }

  const full = await tx
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, claims.userId));
  return full.map(preferenceRowToDto);
}
