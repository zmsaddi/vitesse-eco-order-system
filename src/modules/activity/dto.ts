import { z } from "zod";

// Phase 5.2 — Activity Explorer DTOs.
//
// Read-only surface over the existing `activity_log` table (shipped 0000,
// hash-chained since Phase 3.0.1). 14 entity types + 10 actions match what
// logActivity() writes across the codebase; keeping the enums narrow here
// mirrors the API contract promised in 35_API_Endpoints.md without blocking
// future table additions (the DB column is plain `text`, not an enum).

export const ACTIVITY_ACTIONS = [
  "create",
  "update",
  "delete",
  "cancel",
  "confirm",
  "collect",
  "login",
  "logout",
  "reverse",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// Curated list of entity types the UI offers as filter values. The server
// does not reject other values — any string the table contains is queryable —
// but the dropdown keeps the UX focused on the 20 categories that actually
// appear in the codebase's logActivity() calls.
export const ACTIVITY_ENTITY_TYPES = [
  "orders",
  "order_items",
  "deliveries",
  "payments",
  "invoices",
  "invoice_lines",
  "purchases",
  "purchase_items",
  "expenses",
  "clients",
  "products",
  "suppliers",
  "settings",
  "users",
  "bonuses",
  "cancellations",
  "settlements",
  "treasury_movements",
  "treasury_accounts",
  "auth",
] as const;

export const ActivityDto = z.object({
  id: z.number().int().positive(),
  timestamp: z.string(), // ISO
  userId: z.number().int().positive().nullable(),
  username: z.string(),
  action: z.string(), // widened to text: DB may store pre-enum rows
  entityType: z.string(),
  entityId: z.number().int().positive().nullable(),
  entityRefCode: z.string().nullable(),
  details: z.unknown().nullable(), // arbitrary jsonb
  ipAddress: z.string().nullable(),
});
export type ActivityDto = z.infer<typeof ActivityDto>;

const IsoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD");

export const ListActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  entityType: z.string().min(1).optional(),
  action: z.enum(ACTIVITY_ACTIONS).optional(),
  userId: z.coerce.number().int().positive().optional(),
  dateFrom: IsoDateOnly.optional(),
  dateTo: IsoDateOnly.optional(),
});
export type ListActivityQuery = z.infer<typeof ListActivityQuery>;

export const ListActivityResponse = z.object({
  items: z.array(ActivityDto),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type ListActivityResponse = z.infer<typeof ListActivityResponse>;
