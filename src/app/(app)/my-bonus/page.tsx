import { enforcePageRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { listBonuses } from "@/modules/settlements/service";

// Phase 4.4 — /my-bonus (seller/driver own-only view).
//
// Leakage prevention:
//   - enforcePageRole is the first thing the page does — manager, pm, gm,
//     stock_keeper are redirected to their role-home before any data fetch.
//   - We call `listBonuses` through the claims-aware service, which forces
//     `userId=claims.userId` for seller/driver regardless of what any query
//     param would say. Even though this is a server component (no URL params
//     surface from the browser), the guard is belt-and-suspenders.
//   - No inline aggregation / computation — all numbers come pre-summed from
//     the service's `computeBonusesSummary`.
export default async function MyBonusPage() {
  const claims = await enforcePageRole(["seller", "driver"]);

  const { items, summary } = await withRead(undefined, (db) =>
    listBonuses(
      db,
      { limit: 100, offset: 0 },
      { userId: claims.userId, username: claims.username, role: claims.role },
    ),
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">عمولتي</h1>
        <p className="text-sm text-gray-500">{`الدور: ${claims.role}`}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="غير مدفوعة" value={summary.unpaidTotal} />
        <SummaryCard label="محتجزة" value={summary.retainedTotal} />
        <SummaryCard label="مُسوَّاة" value={summary.settledTotal} />
        <SummaryCard label="الديون" value={summary.debtOutstanding} tone="neg" />
        <SummaryCard
          label="الرصيد المتاح"
          value={summary.availableCredit}
          tone="pos"
        />
      </section>

      <section className="rounded border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">التاريخ</th>
              <th className="px-3 py-2">الطلب</th>
              <th className="px-3 py-2">التسليم</th>
              <th className="px-3 py-2">المجموع</th>
              <th className="px-3 py-2">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  لا توجد علاوات بعد.
                </td>
              </tr>
            ) : (
              items.map((b) => (
                <tr
                  key={b.id}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <td className="px-3 py-2">{b.id}</td>
                  <td className="px-3 py-2">{b.date}</td>
                  <td className="px-3 py-2">{b.orderId}</td>
                  <td className="px-3 py-2">{b.deliveryId}</td>
                  <td className="px-3 py-2">{b.totalBonus}€</td>
                  <td className="px-3 py-2">{b.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  const toneClass =
    tone === "neg"
      ? "text-red-600 dark:text-red-400"
      : tone === "pos"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-gray-900 dark:text-gray-100";
  return (
    <div className="rounded border border-gray-200 p-3 text-sm dark:border-gray-800">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}€</div>
    </div>
  );
}
