import Link from "next/link";
import type {
  DeliveryDto,
  ListDeliveriesQuery,
} from "@/modules/deliveries/dto";
import type { Role } from "@/lib/session-claims";

// Phase 6.4 — Deliveries list renderer.
// Driver sees only own deliveries — `assignedDriverId` filter hidden.
// pm/gm/manager see all, with full filter row.

type Props = {
  deliveries: DeliveryDto[];
  total: number;
  query: ListDeliveriesQuery;
  role: Role;
};

const STATUS_CHOICES = [
  { value: "", label: "الكل" },
  { value: "جاهز", label: "جاهز" },
  { value: "جاري التوصيل", label: "جاري التوصيل" },
  { value: "تم التوصيل", label: "تم التوصيل" },
  { value: "ملغي", label: "ملغي" },
] as const;

export function DeliveriesListClient({
  deliveries,
  total,
  query,
  role,
}: Props) {
  const pageSize = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const pageIndex = Math.floor(offset / pageSize);
  const hasNext = offset + deliveries.length < total;
  const hasPrev = offset > 0;
  const showDriverFilter = role !== "driver";

  return (
    <div className="space-y-4">
      <form
        method="get"
        action="/deliveries"
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
        {showDriverFilter && (
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-gray-500 dark:text-gray-400">
              رقم السائق
            </span>
            <input
              type="number"
              name="assignedDriverId"
              min="1"
              defaultValue={query.assignedDriverId ?? ""}
              dir="ltr"
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
        )}
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
              <th className="px-3 py-2 text-start">السائق</th>
              <th className="px-3 py-2 text-start">الحالة</th>
              <th className="px-3 py-2 text-start">ملاحظة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {deliveries.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  لا توصيلات مطابقة.
                </td>
              </tr>
            ) : (
              deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2" dir="ltr">
                    {d.refCode}
                  </td>
                  <td className="px-3 py-2" dir="ltr">
                    {d.date}
                  </td>
                  <td className="truncate px-3 py-2">{d.clientNameCached}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {d.assignedDriverUsernameCached || "—"}
                  </td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="truncate px-3 py-2 text-gray-500 dark:text-gray-400">
                    {d.notes}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          صفحة {pageIndex + 1} · {deliveries.length} من أصل {total}
        </span>
        <div className="flex gap-2">
          {hasPrev && (
            <Link
              href={buildHref(query, {
                offset: Math.max(0, offset - pageSize),
              })}
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
  base: ListDeliveriesQuery,
  over: Partial<ListDeliveriesQuery>,
): string {
  const sp = new URLSearchParams();
  const merged = { ...base, ...over };
  if (merged.limit !== undefined) sp.set("limit", String(merged.limit));
  if (merged.offset !== undefined) sp.set("offset", String(merged.offset));
  if (merged.status) sp.set("status", merged.status);
  if (merged.dateFrom) sp.set("dateFrom", merged.dateFrom);
  if (merged.dateTo) sp.set("dateTo", merged.dateTo);
  if (merged.assignedDriverId !== undefined) {
    sp.set("assignedDriverId", String(merged.assignedDriverId));
  }
  return `/deliveries?${sp.toString()}`;
}
