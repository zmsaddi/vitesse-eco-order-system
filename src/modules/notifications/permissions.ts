import type { Role } from "@/lib/session-claims";

// Phase 5.1 — notifications permission helper.
//
// Every authenticated role can read/mutate its own notifications + own
// preferences. There is no cross-user access in 5.1 — admin roles cannot
// impersonate another user's inbox. Enforcement happens in the service
// layer by forcing `userId = claims.userId` on every query.

export type NotificationClaims = {
  userId: number;
  username: string;
  role: Role;
};
