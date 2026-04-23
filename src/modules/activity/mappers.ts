import type { activityLog } from "@/db/schema";
import type { ActivityDto } from "./dto";

// Phase 5.2 — activity_log row → DTO.
// Stays narrow: the DTO fields mirror the DB columns one-to-one with the
// usual timestamp → ISO conversion.

type ActivityRow = typeof activityLog.$inferSelect;

export function activityRowToDto(row: ActivityRow): ActivityDto {
  return {
    id: row.id,
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : new Date(row.timestamp as unknown as string).toISOString(),
    userId: row.userId,
    username: row.username,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    entityRefCode: row.entityRefCode,
    details: row.details ?? null,
    ipAddress: row.ipAddress,
  };
}
