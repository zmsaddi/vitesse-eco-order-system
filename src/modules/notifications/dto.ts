import { z } from "zod";

// Phase 5.1 — Notifications DTOs.
//
// The 14 canonical notification types mirror the role-routing matrix in
// 26_Notifications.md lines 28–43. Every enum value here has:
//   - a routing rule in events.ts (per-role recipients)
//   - a preference row auto-seeded on first GET /preferences (enabled=true)
//   - an Arabic label used in UI (bell + /notifications + /settings)
//
// Three values — GIFT_POOL_FILLED, OVERDUE_PAYMENT, RECONCILIATION_REMINDER —
// are defined but have no live emission site in 5.1 because their source
// infrastructure (gift-pool fill endpoint, daily cron) is not yet shipped.
// Their routing + preference + UI rows exist; emission wires when the
// upstream source lands (Phase 6+). This is documented explicitly in the
// 5.1 delivery report's Known Gaps.

export const NOTIFICATION_TYPES = [
  "ORDER_CREATED",
  "ORDER_STARTED_PREPARATION",
  "ORDER_READY_FOR_DELIVERY",
  "DELIVERY_CONFIRMED",
  "PAYMENT_RECEIVED",
  "LOW_STOCK",
  "NEW_TASK",
  "BONUS_CREATED",
  "SETTLEMENT_ISSUED",
  "ORDER_CANCELLED",
  "DRIVER_HANDOVER_DONE",
  "GIFT_POOL_FILLED",
  "OVERDUE_PAYMENT",
  "RECONCILIATION_REMINDER",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NotificationTypeEnum = z.enum(NOTIFICATION_TYPES);

// Arabic label for UI display — must stay aligned with 26_Notifications.md
// matrix headings.
export const NOTIFICATION_TYPE_LABELS_AR: Record<NotificationType, string> = {
  ORDER_CREATED: "طلب جديد",
  ORDER_STARTED_PREPARATION: "طلب دخل قيد التحضير",
  ORDER_READY_FOR_DELIVERY: "طلب جاهز للتوصيل",
  DELIVERY_CONFIRMED: "توصيل مؤكد",
  PAYMENT_RECEIVED: "دفعة مستلمة",
  LOW_STOCK: "مخزون منخفض",
  NEW_TASK: "مهمة جديدة",
  BONUS_CREATED: "عمولة جديدة",
  SETTLEMENT_ISSUED: "تسوية/مكافأة",
  ORDER_CANCELLED: "طلب ملغي",
  DRIVER_HANDOVER_DONE: "سائق سلّم أموالاً",
  GIFT_POOL_FILLED: "هدايا متاحة",
  OVERDUE_PAYMENT: "دفعة متأخرة",
  RECONCILIATION_REMINDER: "تذكير تسوية يومية",
};

export const NotificationDto = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  type: NotificationTypeEnum,
  title: z.string(),
  body: z.string(),
  clickTarget: z.string().nullable(),
  readAt: z.string().nullable(), // ISO when read, else null
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof NotificationDto>;

export const NotificationPreferenceDto = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  notificationType: NotificationTypeEnum,
  channel: z.literal("in_app"), // D-22: in_app only in Phase 5
  enabled: z.boolean(),
});
export type NotificationPreferenceDto = z.infer<
  typeof NotificationPreferenceDto
>;

// GET /api/v1/notifications query.
export const ListNotificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  type: NotificationTypeEnum.optional(),
  unread: z.coerce.boolean().optional(),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuery>;

// PUT /api/v1/notifications/preferences body.
export const UpdatePreferencesInput = z.object({
  updates: z
    .array(
      z.object({
        notificationType: NotificationTypeEnum,
        enabled: z.boolean(),
      }),
    )
    .min(1, "updates فارغة"),
});
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesInput>;

// List response shape.
export const ListNotificationsResponse = z.object({
  items: z.array(NotificationDto),
  total: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type ListNotificationsResponse = z.infer<
  typeof ListNotificationsResponse
>;
