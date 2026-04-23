"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer } from "recharts";
import type { AnyReport, ReportSlug } from "@/modules/reports/dto";
import { downloadCsv } from "@/lib/csv-export";
import { renderChart } from "./chart-renderers";
import { renderTable } from "./table-renderers";
import { csvForReport } from "./csv-shape";

// Phase 5.3 — report detail client. Thin composer: fetches the report,
// delegates chart + table rendering to per-slug helpers, and wires the
// client-side CSV download.

type Query = { dateFrom?: string; dateTo?: string };

async function fetchReport(slug: ReportSlug, q: Query): Promise<AnyReport> {
  const sp = new URLSearchParams();
  if (q.dateFrom) sp.set("dateFrom", q.dateFrom);
  if (q.dateTo) sp.set("dateTo", q.dateTo);
  const url = `/api/v1/reports/${encodeURIComponent(slug)}${
    sp.toString() ? `?${sp}` : ""
  }`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/v1/reports/${slug} → ${res.status}`);
  return (await res.json()) as AnyReport;
}

export function ReportClient({
  slug,
  initialData,
}: {
  slug: ReportSlug;
  initialData: AnyReport;
}) {
  const initialPeriod = initialData.period;
  const [query, setQuery] = useState<Query>({
    dateFrom: initialPeriod.from || undefined,
    dateTo: initialPeriod.to || undefined,
  });

  const isInitial =
    query.dateFrom === (initialPeriod.from || undefined) &&
    query.dateTo === (initialPeriod.to || undefined);

  const rq = useQuery({
    queryKey: ["report", slug, query],
    queryFn: () => fetchReport(slug, query),
    staleTime: 60_000,
    initialData: isInitial ? initialData : undefined,
  });

  const data = rq.data ?? initialData;
  const csv = useMemo(() => csvForReport(data), [data]);

  return (
    <div className="space-y-4">
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
        <button
          type="button"
          onClick={() => downloadCsv(slug, csv.headers, csv.rows)}
          className="ms-auto rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          تصدير CSV
        </button>
      </div>

      <section className="rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="h-80 w-full" aria-label={`${slug} chart`}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(data)}
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {renderTable(data)}
      </section>
    </div>
  );
}
