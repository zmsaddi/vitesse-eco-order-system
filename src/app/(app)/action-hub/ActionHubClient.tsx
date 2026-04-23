import Link from "next/link";
import type { ActionHubResponse } from "@/modules/action-hub/dto";

// Phase 6.2 — Action Hub client renderer.
// Pure presentational: three sections (urgent actions, last-5 activity,
// team counts). Dark-mode styled to match Phase 5.5 polish.

type UrgentRow = {
  key: keyof ActionHubResponse["urgentActions"];
  label: string;
  href: string;
  hint?: string;
};

const URGENT_ROWS: readonly UrgentRow[] = [
  {
    key: "overduePayments",
    label: "مبالغ متأخرة (≥ 7 أيام)",
    href: "/orders?filter=overdue",
  },
  {
    key: "reconciliationDue",
    label: "تسويات صناديق مستحقّة",
    href: "/settlements/new",
  },
  {
    key: "pendingCancellations",
    label: "إلغاءات اليوم بحاجة مراجعة",
    href: "/orders?filter=cancelled-today",
  },
  {
    key: "staleSnapshots",
    label: "نسب عمولات > 60 يوم بلا تحديث",
    href: "/users",
  },
  {
    key: "lowStock",
    label: "منتجات بمخزون منخفض",
    href: "/products?filter=low-stock",
  },
  {
    key: "incompleteSettings",
    label: "إعدادات D-35 ناقصة",
    href: "/settings",
  },
] as const;

export function ActionHubClient({ data }: { data: ActionHubResponse }) {
  const ua = data.urgentActions;
  const anyUrgent = ua.total > 0;

  return (
    <div className="space-y-6">
      {data.scope === "team" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          العرض مقصور على فريقك. إحصاءات النظام الكاملة متاحة لـ pm/gm.
        </p>
      )}

      <section
        aria-label="إجراءات مُلحَّة"
        className="rounded border border-gray-200 p-4 dark:border-gray-800"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">إجراءات مُلحَّة</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {anyUrgent ? `${ua.total} بند` : "لا إجراءات"}
          </span>
        </div>
        {anyUrgent ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {URGENT_ROWS.map((row) => {
              const count = ua[row.key];
              if (count === 0) return null;
              return (
                <li key={row.key} className="flex items-center justify-between py-2">
                  <span className="text-sm">{row.label}</span>
                  <Link
                    href={row.href}
                    className="rounded bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                  >
                    {count}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            لا إجراءات مُلحَّة حالياً.
          </p>
        )}
      </section>

      <section
        aria-label="آخر نشاط"
        className="rounded border border-gray-200 p-4 dark:border-gray-800"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">آخر نشاط</h2>
          <Link
            href="/activity"
            className="text-xs text-gray-500 hover:underline dark:text-gray-400"
          >
            عرض الكل
          </Link>
        </div>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">لا نشاط بعد.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.recentActivity.map((row) => (
              <li key={row.id} className="py-2 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="truncate">
                    <span className="font-medium">{row.username}</span>{" "}
                    <span className="text-gray-500 dark:text-gray-400">{row.action}</span>{" "}
                    <span>{row.entityType}</span>
                    {row.entityRefCode && (
                      <span className="text-gray-500 dark:text-gray-400"> · {row.entityRefCode}</span>
                    )}
                  </span>
                  <time
                    className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                    dir="ltr"
                  >
                    {formatShortTime(row.timestamp)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="حالة الفرق"
        className="rounded border border-gray-200 p-4 dark:border-gray-800"
      >
        <h2 className="mb-3 font-semibold">حالة الفرق</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <CountCard label="طلبات اليوم" value={data.teamCounts.ordersToday} />
          <CountCard label="توصيلات بانتظار" value={data.teamCounts.deliveriesPending} />
          <CountCard label="مخزون منخفض" value={data.teamCounts.lowStockCount} />
          <CountCard label="إلغاءات اليوم" value={data.teamCounts.openCancellations} />
        </dl>
      </section>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-100 p-3 dark:border-gray-800">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-xl font-bold" dir="ltr">
        {value}
      </dd>
    </div>
  );
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
