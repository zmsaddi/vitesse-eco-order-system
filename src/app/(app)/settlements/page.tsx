import { cookies, headers } from "next/headers";
import { enforcePageRole } from "@/lib/session-claims";
import type { SettlementDto } from "@/modules/settlements/dto";
import { NewSettlementForm } from "./_components/new-settlement-form";
import { NewRewardForm } from "./_components/new-reward-form";

// Phase 4.4.1 — pm/gm settlements console.
//
// The page mirrors the minimal contract locked in the Phase 4.4 directive:
// a list table + one form to pay bonuses + one form to grant a discretionary
// reward. Nothing else (no charts, no multi-step wizards, no analytics).
//
// Canonical API usage: the list is fetched through /api/v1/settlements with
// cookie forwarding, so this page sees exactly what an external client sees.
// Forms POST to the same endpoint; each submission generates a fresh
// Idempotency-Key inside its own handleSubmit (see client components) to
// avoid unintended replay on corrected resubmits.

type ListResponse = { items: SettlementDto[]; total: number };

async function fetchSettlementsCanonically(): Promise<ListResponse> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (!host) {
    throw new Error("settlements: cannot resolve host from incoming request");
  }
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const cookieStr = (await cookies()).toString();
  const res = await fetch(
    `${protocol}://${host}/api/v1/settlements?limit=50`,
    { headers: { cookie: cookieStr }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`GET /api/v1/settlements → ${res.status}`);
  }
  return (await res.json()) as ListResponse;
}

export default async function SettlementsPage() {
  await enforcePageRole(["pm", "gm"]);
  const { items, total } = await fetchSettlementsCanonically();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">التسويات والمكافآت</h1>
        <span className="text-xs text-gray-500">{`الإجمالي: ${total}`}</span>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <NewSettlementForm />
        <NewRewardForm />
      </div>

      <section className="rounded border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right text-xs uppercase dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">التاريخ</th>
              <th className="px-3 py-2">المستخدم</th>
              <th className="px-3 py-2">الدور</th>
              <th className="px-3 py-2">النوع</th>
              <th className="px-3 py-2">المبلغ</th>
              <th className="px-3 py-2">طريقة الدفع</th>
              <th className="px-3 py-2">مُستهلَك؟</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  لا توجد تسويات بعد.
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <td className="px-3 py-2">{s.id}</td>
                  <td className="px-3 py-2">{s.date}</td>
                  <td className="px-3 py-2">{s.username}</td>
                  <td className="px-3 py-2">{s.role}</td>
                  <td className="px-3 py-2">
                    <TypeBadge type={s.type} />
                  </td>
                  <td className="px-3 py-2">{s.amount}€</td>
                  <td className="px-3 py-2">{s.paymentMethod}</td>
                  <td className="px-3 py-2">
                    {s.type === "debt"
                      ? s.applied
                        ? `نعم (#${s.appliedInSettlementId ?? "?"})`
                        : "لا"
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function TypeBadge({ type }: { type: SettlementDto["type"] }) {
  const label =
    type === "settlement" ? "تسوية" : type === "reward" ? "مكافأة" : "دَين";
  const cls =
    type === "debt"
      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
      : type === "reward"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100";
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>
  );
}
