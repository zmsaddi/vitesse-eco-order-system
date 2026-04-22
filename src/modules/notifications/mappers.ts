import type {
  notificationPreferences,
  notifications,
} from "@/db/schema";
import type {
  NotificationDto,
  NotificationPreferenceDto,
  NotificationType,
} from "./dto";
import { NOTIFICATION_TYPES } from "./dto";

// Phase 5.1 — row → DTO mappers. Keep narrow: DB row columns are stricter
// than the public DTO (e.g., `type` is text in DB, enum in DTO).

type NotificationRow = typeof notifications.$inferSelect;
type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;

function asNotificationType(v: string): NotificationType {
  const known = (NOTIFICATION_TYPES as readonly string[]).includes(v);
  // Unknown types at runtime would mean DB has a stale row we don't model.
  // Fail loudly rather than silently corrupting the DTO shape.
  if (!known) {
    throw new Error(`notifications.mappers: unknown notification type "${v}"`);
  }
  return v as NotificationType;
}

export function notificationRowToDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    userId: row.userId,
    type: asNotificationType(row.type),
    title: row.title,
    body: row.body,
    clickTarget: row.clickTarget,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function preferenceRowToDto(
  row: NotificationPreferenceRow,
): NotificationPreferenceDto {
  return {
    id: row.id,
    userId: row.userId,
    notificationType: asNotificationType(row.notificationType),
    channel: "in_app",
    enabled: row.enabled,
  };
}
