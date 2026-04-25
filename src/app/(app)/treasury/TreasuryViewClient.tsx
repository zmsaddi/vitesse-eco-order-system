import Link from "next/link";
import type {
  ListTreasuryQuery,
  TreasuryAccountDto,
  TreasuryMovementDto,
} from "@/modules/treasury/dto";

// Phase 6.3 — Treasury snapshot renderer.
// Two read-only tables: accounts (with balance) + movements (paginated).

type Props = {
  accounts: TreasuryAccountDto[];
  movements: TreasuryMovementDto[];
  movementsTotal: number;
  query: ListTreasuryQuery;
};

const ACCOUNT_TYPE_LABEL: Record<TreasuryAccountDto["type"], string> = {
  main_cash: "صندوق رئيسي — كاش",
  main_bank: "صندوق رئيسي — بنك",
  manager_box: "صندوق مدير",
  driver_custody: "عهدة سائق",
};

export function TreasuryViewClient({
  accounts,
  movements,
  movementsTotal,
  query,
}: Props) {
  const pageSize = query.movementsLimit ?? 100;
  const offset = query.movementsOffset ?? 0;
  const pageIndex = Math.floor(offset / pageSize);
  const hasNext = offset + movements.length < movementsTotal;
  const hasPrev = offset > 0;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">الحسابات</h2>
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-start">الاسم</th>
                <th className="px-3 py-2 text-start">النوع</th>
                <th className="px-3 py-2 text-start">الحالة</th>
                <th className="px-3 py-2 text-end">الرصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    لا حسابات ضمن نطاقك.
                  </td>
                </tr>
              ) : (
                accounts.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="truncate px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{ACCOUNT_TYPE_LABEL[a.type]}</td>
                    <td className="px-3 py-2">
                      {a.active ? "مفعّل" : "معطّل"}
                    </td>
                    <td className="px-3 py-2 text-end font-semibold" dir="ltr">
                      {a.balance}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">آخر الحركات</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            صفحة {pageIndex + 1} · {movements.length} من أصل {movementsTotal}
          </span>
        </div>
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-start">التاريخ</th>
                <th className="px-3 py-2 text-start">الفئة</th>
                <th className="px-3 py-2 text-start">من</th>
                <th className="px-3 py-2 text-start">إلى</th>
                <th className="px-3 py-2 text-end">المبلغ</th>
                <th className="px-3 py-2 text-start">ملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    لا حركات.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-3 py-2" dir="ltr">
                      {m.date}
                    </td>
                    <td className="px-3 py-2">{m.category}</td>
                    <td className="px-3 py-2" dir="ltr">
                      {m.fromAccountId ?? "—"}
                    </td>
                    <td className="px-3 py-2" dir="ltr">
                      {m.toAccountId ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {m.amount}
                    </td>
                    <td className="truncate px-3 py-2 text-gray-500 dark:text-gray-400">
                      {m.notes}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex justify-end gap-2 text-xs">
          {hasPrev && (
            <Link
              href={buildHref(query, {
                movementsOffset: Math.max(0, offset - pageSize),
              })}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              السابق
            </Link>
          )}
          {hasNext && (
            <Link
              href={buildHref(query, { movementsOffset: offset + pageSize })}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              التالي
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

function buildHref(
  base: ListTreasuryQuery,
  over: Partial<ListTreasuryQuery>,
): string {
  const sp = new URLSearchParams();
  const merged = { ...base, ...over };
  if (merged.movementsLimit !== undefined) {
    sp.set("movementsLimit", String(merged.movementsLimit));
  }
  if (merged.movementsOffset !== undefined) {
    sp.set("movementsOffset", String(merged.movementsOffset));
  }
  return `/treasury?${sp.toString()}`;
}
