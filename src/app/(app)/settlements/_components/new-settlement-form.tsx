"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phase 4.4.1 — pm/gm inline form for POST /api/v1/settlements (kind="settlement").
//
// Contract surface kept tight per Phase 4.4.1 directive:
//   - userId + bonusIds (CSV) + fromAccountId + paymentMethod + notes.
//   - No autocomplete, no multi-select widget, no inline bonus preview.
//   - Idempotency-Key generated INSIDE handleSubmit on every submission so
//     the user can correct a validation error and resubmit without
//     accidentally replaying the prior request's cached response.

export function NewSettlementForm() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [bonusIdsCsv, setBonusIdsCsv] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"كاش" | "بنك">("كاش");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const ids = bonusIdsCsv
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);

    // Generated per-submission (NOT on mount / NOT in useState init). A
    // corrected resubmit carries a fresh key — no unintended replay.
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/v1/settlements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          kind: "settlement",
          userId: Number(userId),
          bonusIds: ids,
          fromAccountId: Number(fromAccountId),
          paymentMethod,
          notes,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        result?: { netPayout?: string; settlement?: { id?: number } };
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
        text: `تم إنشاء التسوية #${body.result?.settlement?.id ?? "?"} بمبلغ صافٍ ${body.result?.netPayout ?? "?"}€.`,
      });
      // Reset scalar fields; keep userId in case pm pays multiple bonuses
      // for the same user back-to-back.
      setBonusIdsCsv("");
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
      <h3 className="text-base font-semibold">تسوية جديدة (دفع علاوات)</h3>
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
        <Field label="bonusIds (CSV)">
          <input
            type="text"
            required
            placeholder="12,13,14"
            value={bonusIdsCsv}
            onChange={(e) => setBonusIdsCsv(e.target.value)}
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
          className="rounded bg-blue-600 px-4 py-1.5 text-white disabled:opacity-50"
        >
          {busy ? "جارٍ الإرسال..." : "دفع"}
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
