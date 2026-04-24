import Link from "next/link";
import type { InvoiceDto, ListInvoicesQuery } from "@/modules/invoices/dto";

// Phase 6.3 — Invoices list renderer.
// Pure SSR: the filter form submits as GET (default <form> semantics) so
// `searchParams` drives the query; no client JS required. Dark-mode styled
// to match Phase 5.5 polish.

type Props = {
  invoices: InvoiceDto[];
  total: number;
  query: ListInvoicesQuery;
};

const STATUS_CHOICES = [
  { value: "", label: "الكل" },
  { value: "مؤكد", label: "مؤكد" },
  { value: "ملغي", label: "ملغي" },
] as const;

export function InvoicesListClient({ invoices, total, query }: Props) {
  const pageSize = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const pageIndex = Math.floor(offset / pageSize);
  const hasNext = offset + invoices.length < total;
  const hasPrev = offset > 0;

  return (
    <div className="space-y-4">
      <form
        method="get"
        action="/invoices"
        className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3 dark:border-gray-800"
      >
        <label className="flex flex-col text-xs">
          <span className="mb-1 text-gray-500 dark:text-gray-400">من تاريخ</span>
          <input
            type="date"
            name="dateFrom"
            defaultValue={query.dateFrom ?? ""}
            dir="ltr"
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1 text-gray-500 dark:text-gray-400">إلى تاريخ</span>
          <input
            type="date"
            name="dateTo"
            defaultValue={query.dateTo ?? ""}
            dir="ltr"
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1 text-gray-500 dark:text-gray-400">الحالة</span>
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            {STATUS_CHOICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="limit" value={pageSize} />
        <button
          type="submit"
          className="rounded bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
        >
          تطبيق
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-start">الرقم</th>
              <th className="px-3 py-2 text-start">التاريخ</th>
              <th className="px-3 py-2 text-start">العميل</th>
              <th className="px-3 py-2 text-start">الحالة</th>
              <th className="px-3 py-2 text-end">المجموع TTC</th>
              <th className="px-3 py-2 text-end">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                  لا فواتير مطابقة.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-3 py-2" dir="ltr">
                    {inv.refCode}
                  </td>
                  <td className="px-3 py-2" dir="ltr">
                    {inv.date}
                  </td>
                  <td className="truncate px-3 py-2">{inv.clientNameFrozen}</td>
                  <td className="px-3 py-2">{inv.status}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">
                    {inv.totalTtcFrozen}
                  </td>
                  <td className="px-3 py-2 text-end">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`/api/v1/invoices/${inv.id}/pdf`}
                        download
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        PDF
                      </a>
                      <Link
                        href={`/invoices/${inv.id}/print`}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        طباعة
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          صفحة {pageIndex + 1} · {invoices.length} من أصل {total}
        </span>
        <div className="flex gap-2">
          {hasPrev && (
            <Link
              href={buildHref(query, { offset: Math.max(0, offset - pageSize) })}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              السابق
            </Link>
          )}
          {hasNext && (
            <Link
              href={buildHref(query, { offset: offset + pageSize })}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              التالي
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function buildHref(
  base: ListInvoicesQuery,
  over: Partial<ListInvoicesQuery>,
): string {
  const sp = new URLSearchParams();
  const merged = { ...base, ...over };
  if (merged.limit !== undefined) sp.set("limit", String(merged.limit));
  if (merged.offset !== undefined) sp.set("offset", String(merged.offset));
  if (merged.dateFrom) sp.set("dateFrom", merged.dateFrom);
  if (merged.dateTo) sp.set("dateTo", merged.dateTo);
  if (merged.status) sp.set("status", merged.status);
  return `/invoices?${sp.toString()}`;
}
