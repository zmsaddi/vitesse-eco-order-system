// Phase 5.1b — client-side fetch helpers for the notifications endpoints.
//
// Every helper is thin: builds the URL, calls fetch, reads the Json body, and
// lets the global fetch interceptor (hooks/useUnreadCount.ts) handle the
// X-Unread-Count header side-effect. No business logic here — just wire.

import type {
  ListNotificationsResponse,
  NotificationDto,
  NotificationPreferenceDto,
} from "@/modules/notifications/dto";

export type ListQuery = {
  limit?: number;
  offset?: number;
  type?: string;
  unread?: boolean;
};

function qs(q: ListQuery): string {
  const sp = new URLSearchParams();
  if (q.limit !== undefined) sp.set("limit", String(q.limit));
  if (q.offset !== undefined) sp.set("offset", String(q.offset));
  if (q.type !== undefined) sp.set("type", q.type);
  if (q.unread === true) sp.set("unread", "true");
  const s = sp.toString();
  return s.length > 0 ? `?${s}` : "";
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchNotifications(
  q: ListQuery,
): Promise<ListNotificationsResponse> {
  const res = await fetch(`/api/v1/notifications${qs(q)}`, {
    cache: "no-store",
  });
  return json<ListNotificationsResponse>(res);
}

export async function markOneRead(id: number): Promise<NotificationDto> {
  const res = await fetch(`/api/v1/notifications/${id}/mark-read`, {
    method: "POST",
    headers: { "Idempotency-Key": `mark-${id}-${Date.now()}` },
  });
  const body = (await json<{ notification: NotificationDto }>(res)).notification;
  return body;
}

export async function markAllRead(): Promise<{ updatedCount: number }> {
  const res = await fetch(`/api/v1/notifications/mark-all-read`, {
    method: "POST",
    headers: { "Idempotency-Key": `mark-all-${Date.now()}` },
  });
  return json<{ updatedCount: number }>(res);
}

export async function fetchPreferences(): Promise<NotificationPreferenceDto[]> {
  const res = await fetch(`/api/v1/notifications/preferences`, {
    cache: "no-store",
  });
  const body = await json<{ preferences: NotificationPreferenceDto[] }>(res);
  return body.preferences;
}

export async function updatePreferences(
  updates: Array<{ notificationType: string; enabled: boolean }>,
): Promise<NotificationPreferenceDto[]> {
  const res = await fetch(`/api/v1/notifications/preferences`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `prefs-${Date.now()}`,
    },
    body: JSON.stringify({ updates }),
  });
  const body = await json<{ preferences: NotificationPreferenceDto[] }>(res);
  return body.preferences;
}
