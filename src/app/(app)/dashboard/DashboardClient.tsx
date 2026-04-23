"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Role } from "@/lib/session-claims";
import type { DashboardResponse } from "@/modules/dashboard/dto";

// Phase 5.3 — Dashboard client: KPI cards + date filter + treasury balances
// table + counts. No charts here — charts live in each report page.

type Query = { dateFrom?: string; dateTo?: string };

async function fetchDashboard(q: Query): Promise<DashboardResponse> {
  const sp = new URLSearchParams();
  if (q.dateFrom) sp.set("dateFrom", q.dateFrom);
  if (q.dateTo) sp.set("dateTo", q.dateTo);
  const url = `/api/v1/dashboard${sp.toString() ? `?${sp}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/v1/dashboard → ${res.status}`);
  return (await res.json()) as DashboardResponse;
}

function KpiCard({
  label,
  value,
  subdued,
  tone,
}: {
  label: string;
  value: string;
  subdued?: boolean;
  tone?: "pos" | "neg" | "neutral";
}) {
  const toneCls =
    tone === "pos"
      ? "text-green-700 dark:text-green-400"
      : tone === "neg"
      ? "text-red-700 dark:text-red-400"
      : "text-gray-900 dark:text-gray-100";
  return (
    <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${toneCls} ${subdued ? "opacity-60" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

export function DashboardClient({
  initialData,
  role,
}: {
  initialData: DashboardResponse;
  role: Role;
}) {
  const [query, setQuery] = useState<Query>({
    dateFrom: initialData.period.from,
    dateTo: initialData.period.to,
  });
  const dashQ = useQuery({
    queryKey: ["dashboard", query],
    queryFn: () => fetchDashboard(query),
    staleTime: 60_000,
    initialData:
      query.dateFrom === initialData.period.from &&
      query.dateTo === initialData.period.to
        ? initialData
        : undefined,
  });
  const d = dashQ.data ?? initialData;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <label className="text-xs text-gray-600 dark:text-gray-400">
          من تاريخ
          <input
            type="date"
            value={query.dateFrom ?? ""}
            onChange={(e) =>
              setQuery((q) => ({ ...q, dateFrom: e.target.value || undefined }))
            }
            className="ms-2 block rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          إلى تاريخ
          <input
            type="date"
            value={query.dateTo ?? ""}
            onChange={(e) =>
              setQuery((q) => ({ ...q, dateTo: e.target.value || undefined }))
            }
            className="ms-2 block rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <Link
          href="/reports"
          className="ms-auto rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          التقارير
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="الإيرادات" value={`${d.kpis.revenue}€`} tone="pos" />
        <KpiCard
          label="صافي الربح"
          value={d.kpis.netProfit !== null ? `${d.kpis.netProfit}€` : "—"}
          subdued={d.kpis.netProfit === null}
          tone={d.kpis.netProfit !== null && Number(d.kpis.netProfit) < 0 ? "neg" : "pos"}
        />
        <KpiCard label="الديون المستحقة" value={`${d.kpis.outstandingDebts}€`} tone="neg" />
        <KpiCard
          label="الربح النقدي"
          value={d.kpis.cashProfit !== null ? `${d.kpis.cashProfit}€` : "—"}
          subdued={d.kpis.cashProfit === null}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="طلبات اليوم" value={String(d.counts.ordersToday)} />
        <KpiCard
          label="توصيلات قيد الانتظار"
          value={String(d.counts.deliveriesPending)}
        />
        <KpiCard label="مخزون منخفض" value={String(d.counts.lowStockCount)} />
        <KpiCard
          label="إلغاءات في الفترة"
          value={String(d.counts.openCancellations)}
        />
      </section>

      <section className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <header className="border-b border-gray-200 px-3 py-2 text-sm font-semibold dark:border-gray-700">
          {role === "manager" ? "صندوقي + عهدات فريقي" : "أرصدة الصناديق"}
        </header>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900/60">
            <tr>
              <th className="px-3 py-2">الحساب</th>
              <th className="px-3 py-2">النوع</th>
              <th className="px-3 py-2">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {d.treasuryBalances.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-4 text-center text-gray-500"
                >
                  لا صناديق مرئية.
                </td>
              </tr>
            ) : (
              d.treasuryBalances.map((a) => (
                <tr
                  key={a.accountId}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {a.type}
                  </td>
                  <td className="px-3 py-2">{a.balance}€</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
