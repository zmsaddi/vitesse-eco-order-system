"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Role } from "@/lib/session-claims";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_ENTITY_TYPES,
  type ActivityAction,
  type ListActivityResponse,
} from "@/modules/activity/dto";

// Phase 5.2 — Activity Explorer client. Drives filters + pagination on top
// of the /api/v1/activity canonical endpoint. Initial data comes from SSR
// so the first paint has content without a loading flash; subsequent state
// changes re-fetch via TanStack Query.

type Query = {
  limit: number;
  offset: number;
  entityType?: string;
  action?: ActivityAction;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
};

async function fetchActivity(q: Query): Promise<ListActivityResponse> {
  const sp = new URLSearchParams();
  sp.set("limit", String(q.limit));
  sp.set("offset", String(q.offset));
  if (q.entityType) sp.set("entityType", q.entityType);
  if (q.action) sp.set("action", q.action);
  if (q.userId !== undefined) sp.set("userId", String(q.userId));
  if (q.dateFrom) sp.set("dateFrom", q.dateFrom);
  if (q.dateTo) sp.set("dateTo", q.dateTo);
  const res = await fetch(`/api/v1/activity?${sp.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET /api/v1/activity → ${res.status}`);
  return (await res.json()) as ListActivityResponse;
}

export function ActivityListClient({
  initialQuery,
  initialData,
  role,
}: {
  initialQuery: Query;
  initialData: ListActivityResponse;
  role: Role;
}) {
  const [query, setQuery] = useState<Query>(initialQuery);
  const isInitial = useMemo(
    () =>
      query.limit === initialQuery.limit &&
      query.offset === initialQuery.offset &&
      query.entityType === initialQuery.entityType &&
      query.action === initialQuery.action &&
      query.userId === initialQuery.userId &&
      query.dateFrom === initialQuery.dateFrom &&
      query.dateTo === initialQuery.dateTo,
    [query, initialQuery],
  );

  const listQ = useQuery({
    queryKey: ["activity", query],
    queryFn: () => fetchActivity(query),
    staleTime: 30_000,
    initialData: isInitial ? initialData : undefined,
  });

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / query.limit));
  const currentPage = Math.floor(query.offset / query.limit) + 1;

  function patch<K extends keyof Query>(k: K, v: Query[K]) {
    setQuery((q) => ({ ...q, [k]: v, offset: 0 }));
  }
  function resetFilters() {
    setQuery({ limit: 50, offset: 0 });
  }
  function gotoPage(p: number) {
    const clamped = Math.min(pageCount, Math.max(1, p));
    setQuery((q) => ({ ...q, offset: (clamped - 1) * q.limit }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <label className="text-xs text-gray-600 dark:text-gray-400">
          النوع
          <select
            value={query.entityType ?? ""}
            onChange={(e) => patch("entityType", e.target.value || undefined)}
            className="ms-2 block rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">الكل</option>
            {ACTIVITY_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          الإجراء
          <select
            value={query.action ?? ""}
            onChange={(e) =>
              patch("action", (e.target.value || undefined) as ActivityAction | undefined)
            }
            className="ms-2 block rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">الكل</option>
            {ACTIVITY_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          ID المستخدم
          <input
            type="number"
            min={1}
            value={query.userId ?? ""}
            onChange={(e) =>
              patch("userId", e.target.value ? Number(e.target.value) : undefined)
            }
            className="ms-2 block w-24 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
            dir="ltr"
          />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          من تاريخ
          <input
            type="date"
            value={query.dateFrom ?? ""}
            onChange={(e) => patch("dateFrom", e.target.value || undefined)}
            className="ms-2 block rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          إلى تاريخ
          <input
            type="date"
            value={query.dateTo ?? ""}
            onChange={(e) => patch("dateTo", e.target.value || undefined)}
            className="ms-2 block rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          مسح الفلاتر
        </button>
        <div className="ms-auto text-xs text-gray-500">
          {role === "manager" ? "نطاقي + فريقي فقط" : "كل النشاط"}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900/60">
            <tr>
              <th className="px-3 py-2">الوقت</th>
              <th className="px-3 py-2">المستخدم</th>
              <th className="px-3 py-2">الإجراء</th>
              <th className="px-3 py-2">النوع</th>
              <th className="px-3 py-2">المرجع</th>
              <th className="px-3 py-2">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  جارٍ التحميل...
                </td>
              </tr>
            )}
            {listQ.isError && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-red-600">
                  تعذّر التحميل
                </td>
              </tr>
            )}
            {!listQ.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  لا توجد سجلات مطابقة.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr
                key={r.id}
                className="border-t border-gray-100 dark:border-gray-800"
              >
                <td className="px-3 py-2 whitespace-nowrap text-xs" dir="ltr">
                  {new Date(r.timestamp).toLocaleString("fr-FR")}
                </td>
                <td className="px-3 py-2">{r.username}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2">{r.entityType}</td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400" dir="ltr">
                  {r.entityRefCode ?? (r.entityId !== null ? `#${r.entityId}` : "—")}
                </td>
                <td className="px-3 py-2 max-w-sm truncate text-xs text-gray-600 dark:text-gray-400" dir="ltr">
                  {r.details ? JSON.stringify(r.details) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
        <div>
          صفحة {currentPage} من {pageCount} · {total} سجل
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
