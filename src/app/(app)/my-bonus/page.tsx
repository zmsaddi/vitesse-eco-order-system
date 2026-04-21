import { cookies, headers } from "next/headers";
import { enforcePageRole } from "@/lib/session-claims";
import type { BonusDto, BonusesSummaryDto } from "@/modules/settlements/dto";

// Phase 4.4.1 — /my-bonus (seller/driver own-only view).
//
// Canonical API usage: the page goes through the HTTP route handler
// (/api/v1/bonuses) rather than importing `listBonuses` directly. This keeps
// the page thin, guarantees it sees the exact same shape an external client
// would see, and closes the drift risk a direct service-level import
// would open on the next edit (middleware, rate-limits, observability all
// attach to the route layer).
//
// Leakage prevention:
//   - enforcePageRole redirects manager / pm / gm / stock_keeper to their
//     role-home BEFORE any data fetch.
//   - The route handler itself forces userId=claims.userId for seller/driver
//     regardless of query params — no override is possible from here.
//   - This page passes NO query params at all; the route applies the
//     own-only filter server-side.

type BonusesResponse = {
  items: BonusDto[];
  summary: BonusesSummaryDto;
};

async function fetchBonusesCanonically(): Promise<BonusesResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("my-bonus: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();
  const res = await fetch(`${protocol}://${host}/api/v1/bonuses`, {
    headers: { cookie: cookieStr },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET /api/v1/bonuses → ${res.status}`);
  }
  return (await res.json()) as BonusesResponse;
}

export default async function MyBonusPage() {
  const claims = await enforcePageRole(["seller", "driver"]);
  const { items, summary } = await fetchBonusesCanonically();

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
