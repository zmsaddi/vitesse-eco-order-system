"use client";

import type { AnyReport } from "@/modules/reports/dto";

// Phase 5.3 — table renderer per report slug. Returns a plain <table> tree
// styled for RTL. Chart companion in chart-renderers.tsx.

export function renderTable(data: AnyReport): React.ReactElement {
  switch (data.slug) {
    case "pnl":
      return (
        <table className="w-full text-sm">
          <tbody>
            {[
              ["الإيراد (TTC)", data.revenue],
              ["تكلفة المبيعات (COGS)", data.cogs],
              ["المصاريف", data.expenses],
              ["العمولات المكتسبة", data.earnedBonuses],
              ["تكلفة الهدايا", data.giftCost],
              ["المكافآت", data.rewards],
              ["صافي الربح", data.netProfit],
            ].map(([k, v]) => (
              <tr key={k} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2 font-semibold">{k}</td>
                <td className="px-3 py-2" dir="ltr">
                  {v}€
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "revenue-by-day":
      return (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900/60">
            <tr>
              <th className="px-3 py-2">اليوم</th>
              <th className="px-3 py-2">الإيراد</th>
            </tr>
          </thead>
          <tbody>
            {data.series.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-4 text-center text-gray-500">
                  لا بيانات.
                </td>
              </tr>
            ) : (
              data.series.map((r) => (
                <tr
                  key={r.date}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <td className="px-3 py-2" dir="ltr">
                    {r.date}
                  </td>
                  <td className="px-3 py-2" dir="ltr">
                    {r.revenue}€
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      );
    case "top-clients-by-debt":
      return (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900/60">
            <tr>
              <th className="px-3 py-2">العميل</th>
              <th className="px-3 py-2">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={r.clientId}
                className="border-t border-gray-100 dark:border-gray-800"
              >
                <td className="px-3 py-2">{r.clientName}</td>
                <td className="px-3 py-2" dir="ltr">
                  {r.totalRemaining}€
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "top-products-by-revenue":
      return (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900/60">
            <tr>
              <th className="px-3 py-2">المنتج</th>
              <th className="px-3 py-2">الإيراد</th>
              <th className="px-3 py-2">الكمية</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={r.productId}
                className="border-t border-gray-100 dark:border-gray-800"
              >
                <td className="px-3 py-2">{r.productName}</td>
                <td className="px-3 py-2" dir="ltr">
                  {r.revenue}€
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {r.qty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "expenses-by-category":
      return (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900/60">
            <tr>
              <th className="px-3 py-2">الفئة</th>
              <th className="px-3 py-2">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={r.category}
                className="border-t border-gray-100 dark:border-gray-800"
              >
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2" dir="ltr">
                  {r.total}€
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "bonuses-by-user":
      return (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900/60">
            <tr>
              <th className="px-3 py-2">المستخدم</th>
              <th className="px-3 py-2">الدور</th>
              <th className="px-3 py-2">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={`${r.userId}-${r.role}`}
                className="border-t border-gray-100 dark:border-gray-800"
              >
                <td className="px-3 py-2">{r.username}</td>
                <td className="px-3 py-2">{r.role}</td>
                <td className="px-3 py-2" dir="ltr">
                  {r.totalBonus}€
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}
