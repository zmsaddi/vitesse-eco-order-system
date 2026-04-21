"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phase 4.4.1 — pm/gm inline form for POST /api/v1/settlements (kind="reward").
//
// Reward is a discretionary payout unrelated to bonuses/debts. Surface:
//   - userId + amount + fromAccountId + paymentMethod + notes.
//   - Idempotency-Key generated inside handleSubmit (same rule as the
//     settlement form) so corrected resubmits never reuse a stale key.

export function NewRewardForm() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"كاش" | "بنك">("كاش");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await fetch("/api/v1/settlements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          kind: "reward",
          userId: Number(userId),
          amount: Number(amount),
          fromAccountId: Number(fromAccountId),
          paymentMethod,
          notes,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        result?: { settlement?: { id?: number; amount?: string } };
      };
      if (!res.ok) {
        setMsg({
          ok: false,
          text: `فشل (${res.status}) ${body.code ?? ""} — ${body.message ?? "راجع البيانات"}`,
        });
        return;
      }
      setMsg({
        ok: true,
        text: `تمت المكافأة #${body.result?.settlement?.id ?? "?"} بمبلغ ${body.result?.settlement?.amount ?? "?"}€.`,
      });
      setAmount("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setMsg({
        ok: false,
        text: `خطأ غير متوقَّع: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded border border-gray-200 p-3 text-sm dark:border-gray-800"
    >
      <h3 className="text-base font-semibold">مكافأة جديدة</h3>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="userId">
          <input
            type="number"
            min={1}
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded border px-2 py-1 dark:bg-gray-900"
          />
        </Field>
        <Field label="amount (€)">
          <input
            type="number"
            min={0.01}
            step={0.01}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded border px-2 py-1 dark:bg-gray-900"
          />
        </Field>
        <Field label="fromAccountId">
          <input
            type="number"
            min={1}
            required
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            className="w-full rounded border px-2 py-1 dark:bg-gray-900"
          />
        </Field>
        <Field label="paymentMethod">
          <select
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as "كاش" | "بنك")
            }
            className="w-full rounded border px-2 py-1 dark:bg-gray-900"
          >
            <option value="كاش">كاش</option>
            <option value="بنك">بنك</option>
          </select>
        </Field>
        <Field label="ملاحظات">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border px-2 py-1 dark:bg-gray-900"
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-emerald-600 px-4 py-1.5 text-white disabled:opacity-50"
        >
          {busy ? "جارٍ الإرسال..." : "دفع مكافأة"}
        </button>
        {msg ? (
          <span
            className={msg.ok ? "text-emerald-700" : "text-red-700"}
            role="status"
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}
