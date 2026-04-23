"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellIcon } from "./BellIcon";
import {
  useHydrateUnreadCount,
  useInstallFetchInterceptor,
  useUnreadCount,
} from "@/hooks/useUnreadCount";
import {
  useMarkAllRead,
  useMarkOneRead,
  useNotificationsQuery,
} from "@/hooks/useNotifications";
import { NOTIFICATION_TYPE_LABELS_AR } from "@/modules/notifications/dto";

// Phase 5.1b — Topbar bell + dropdown.
//
// Behaviour per 26_Notifications.md §"Polling strategy" (D-42):
//   - Badge: authoritative from useUnreadCount store. Initial value comes
//     from the server (SSR count passed as prop), so first render is correct.
//   - Dropdown fetch: on-demand — the query is `enabled: open`. staleTime 10s
//     so quick re-opens don't re-fetch.
//   - Mark-as-read on item click is optimistic from the badge's perspective:
//     the mutation response carries the new X-Unread-Count which the fetch
//     interceptor pushes into the store.

const DROPDOWN_LIMIT = 10;

export function BellDropdown({ initialUnreadCount }: { initialUnreadCount: number }) {
  useInstallFetchInterceptor();
  useHydrateUnreadCount(initialUnreadCount);
  const unread = useUnreadCount();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const listQ = useNotificationsQuery(
    { limit: DROPDOWN_LIMIT, offset: 0 },
    { enabled: open },
  );
  const markOne = useMarkOneRead();
  const markAll = useMarkAllRead();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`الإشعارات (${unread} غير مقروء)`}
        aria-expanded={open}
        className="relative rounded p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -left-1 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full mt-2 w-80 rounded border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ insetInlineStart: 0 }}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
            <span className="font-semibold">الإشعارات</span>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || unread === 0}
              className="text-xs text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-400"
            >
              تعليم الكل كمقروء
            </button>
          </div>

          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto text-sm dark:divide-gray-800">
            {listQ.isLoading && (
              <li className="px-3 py-4 text-center text-gray-500">جارٍ التحميل...</li>
            )}
            {listQ.isError && (
              <li className="px-3 py-4 text-center text-red-600">تعذّر التحميل</li>
            )}
            {listQ.data && listQ.data.items.length === 0 && (
              <li className="px-3 py-4 text-center text-gray-500">لا توجد إشعارات</li>
            )}
            {listQ.data?.items.map((n) => {
              const isUnread = !n.readAt;
              const clickTarget = n.clickTarget ?? "/notifications";
              return (
                <li key={n.id}>
                  <Link
                    href={clickTarget}
                    onClick={() => {
                      if (isUnread) markOne.mutate(n.id);
                      setOpen(false);
                    }}
                    className={
                      "block px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 " +
                      (isUnread ? "font-semibold" : "text-gray-600 dark:text-gray-400")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{n.title}</span>
                      <span className="text-xs text-gray-500">
                        {NOTIFICATION_TYPE_LABELS_AR[n.type]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">{n.body}</div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-gray-700 hover:underline dark:text-gray-300"
            >
              عرض كل الإشعارات
            </Link>
            <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="text-gray-700 hover:underline dark:text-gray-300"
            >
              تفضيلات الإشعارات
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
