"use client";

import { useMemo, useState } from "react";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS_AR,
  type NotificationPreferenceDto,
  type NotificationType,
} from "@/modules/notifications/dto";
import {
  usePreferencesQuery,
  useUpdatePreferences,
} from "@/hooks/useNotifications";

// Phase 5.1b — toggle form for the 14 notification types.
//
// Behaviour:
//   - Server-seeded initial state (14 rows) is passed as initialData so the
//     form renders without a loading flash.
//   - Edits are local; "حفظ" sends only the delta (notificationType, enabled
//     pairs that differ from the server snapshot) via PUT.
//   - After a successful save, the mutation callback rebases the draft onto
//     the server response — no derived-state useEffect needed.

export function PreferencesFormClient({
  initialPreferences,
}: {
  initialPreferences: NotificationPreferenceDto[];
}) {
  const prefsQ = usePreferencesQuery({ initialData: initialPreferences });
  const serverRows = prefsQ.data ?? initialPreferences;
  const serverMap = useMemo(() => rowsToMap(serverRows), [serverRows]);

  const [draft, setDraft] = useState<Record<NotificationType, boolean>>(() =>
    rowsToMap(initialPreferences),
  );

  const save = useUpdatePreferences();

  const delta = NOTIFICATION_TYPES.filter((t) => draft[t] !== serverMap[t]).map(
    (t) => ({ notificationType: t, enabled: draft[t] }),
  );
  const dirty = delta.length > 0;

  function toggle(t: NotificationType) {
    setDraft((d) => ({ ...d, [t]: !d[t] }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || save.isPending) return;
    save.mutate(delta, {
      onSuccess: (fresh) => setDraft(rowsToMap(fresh)),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {save.isSuccess && !dirty && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          تم الحفظ.
        </div>
      )}
      {save.isError && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          تعذّر الحفظ. حاول مجدداً.
        </div>
      )}

      <ul className="divide-y divide-gray-100 rounded border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
        {NOTIFICATION_TYPES.map((t) => (
          <li
            key={t}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <label className="flex-1 cursor-pointer">
              {NOTIFICATION_TYPE_LABELS_AR[t]}
              <span className="ms-2 text-xs text-gray-500">({t})</span>
            </label>
            <input
              type="checkbox"
              checked={draft[t] ?? true}
              onChange={() => toggle(t)}
              className="h-4 w-4"
              aria-label={`تفعيل ${NOTIFICATION_TYPE_LABELS_AR[t]}`}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-gray-500">
          {dirty ? `${delta.length} تغيير بانتظار الحفظ` : "لا تغييرات"}
        </span>
        <button
          type="submit"
          disabled={!dirty || save.isPending}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
        </button>
      </div>
    </form>
  );
}

function rowsToMap(
  rows: NotificationPreferenceDto[],
): Record<NotificationType, boolean> {
  const map = Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t, true]),
  ) as Record<NotificationType, boolean>;
  for (const r of rows) {
    map[r.notificationType] = r.enabled;
  }
  return map;
}
