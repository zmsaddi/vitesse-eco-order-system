"use client";

import Link from "next/link";
import { useState } from "react";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS_AR,
  type ListNotificationsResponse,
} from "@/modules/notifications/dto";
import {
  useMarkAllRead,
  useMarkOneRead,
  useNotificationsQuery,
} from "@/hooks/useNotifications";

// Phase 5.1b — client half of /notifications. Holds the filters + pagination
// state and drives the TanStack Query; the bell badge reacts automatically
// through the global fetch interceptor.

type Query = {
  limit: number;
  offset: number;
  type?: string;
  unread?: boolean;
};

export function NotificationsListClient({
  initialQuery,
  initialData,
}: {
  initialQuery: Query;
  initialData: ListNotificationsResponse;
}) {
  const [query, setQuery] = useState<Query>(initialQuery);
  const isInitial =
    query.limit === initialQuery.limit &&
    query.offset === initialQuery.offset &&
    query.type === initialQuery.type &&
    query.unread === initialQuery.unread;

  const listQ = useNotificationsQuery(query, {
    initialData: isInitial ? initialData : undefined,
  });
  const markOne = useMarkOneRead();
  const markAll = useMarkAllRead();

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const unread = listQ.data?.unreadCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / query.limit));
  const currentPage = Math.floor(query.offset / query.limit) + 1;

  function setType(t: string | undefined) {
    setQuery((q) => ({ ...q, type: t, offset: 0 }));
  }
  function setUnread(v: boolean | undefined) {
    setQuery((q) => ({ ...q, unread: v, offset: 0 }));
  }
  function gotoPage(p: number) {
    const clamped = Math.min(pageCount, Math.max(1, p));
    setQuery((q) => ({ ...q, offset: (clamped - 1) * q.limit }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <label className="text-xs text-gray-600 dark:text-gray-400">
          النوع
          <select
            value={query.type ?? ""}
            onChange={(e) => setType(e.target.value || undefined)}
            className="ms-2 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">الكل</option>
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTIFICATION_TYPE_LABELS_AR[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          الحالة
          <select
            value={query.unread === true ? "unread" : "all"}
            onChange={(e) => setUnread(e.target.value === "unread" ? true : undefined)}
            className="ms-2 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="all">الكل</option>
            <option value="unread">غير مقروء فقط</option>
          </select>
        </label>
        <div className="ms-auto text-xs text-gray-600 dark:text-gray-400">
          {total} سجل · {unread} غير مقروء
        </div>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending || unread === 0}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          تعليم الكل كمقروء
        </button>
      </div>

      <ul className="divide-y divide-gray-100 rounded border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
        {listQ.isLoading && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">جارٍ التحميل...</li>
        )}
        {listQ.isError && (
          <li className="px-4 py-6 text-center text-sm text-red-600">تعذّر التحميل</li>
        )}
        {!listQ.isLoading && items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">لا توجد إشعارات مطابقة.</li>
        )}
        {items.map((n) => {
          const isUnread = !n.readAt;
          const clickTarget = n.clickTarget ?? "#";
          return (
            <li key={n.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={clickTarget}
                    onClick={() => {
                      if (isUnread) markOne.mutate(n.id);
                    }}
                    className={
                      "hover:underline " +
                      (isUnread ? "font-semibold" : "text-gray-700 dark:text-gray-300")
                    }
                  >
                    {n.title}
                  </Link>
                  <span className="text-xs text-gray-500">
                    {NOTIFICATION_TYPE_LABELS_AR[n.type]}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">{n.body}</div>
                <div className="mt-1 text-[11px] text-gray-500" dir="ltr">
                  {new Date(n.createdAt).toLocaleString("fr-FR")}
                </div>
              </div>
              {isUnread && (
                <button
                  type="button"
                  onClick={() => markOne.mutate(n.id)}
                  className="shrink-0 text-xs text-gray-600 hover:underline dark:text-gray-400"
                >
                  تعليم كمقروء
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
        <div>
          صفحة {currentPage} من {pageCount}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => gotoPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            السابق
          </button>
          <button
            type="button"
            onClick={() => gotoPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            التالي
          </button>
        </div>
      </div>
    </div>
  );
}
