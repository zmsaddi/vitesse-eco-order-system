import { ConflictError } from "@/lib/api-errors";

// Phase 4.4 — shared source-account invariants for settlement + reward
// payouts. Folded into a single error code (SETTLEMENT_SOURCE_ACCOUNT_INVALID)
// per user directive: the wire surface stays small, the 409 body carries
// enough detail for the UI to branch.
//
// Two invariants bundled:
//   1. fromAccount.type ∈ {main_cash, main_bank} — no payout from
//      manager_box or driver_custody. Those are sub-ledgers; they can't
//      be the source of an outbound payout.
//   2. (main_cash, paymentMethod) MUST be "كاش". (main_bank, paymentMethod)
//      MUST be "بنك". A mismatched combo is a contract lie — the caller
//      cannot claim a bank transfer while draining the cash till.

export function assertSourceAccountForPayout(
  accountType: string,
  paymentMethod: "كاش" | "بنك",
  accountId: number,
): void {
  if (accountType !== "main_cash" && accountType !== "main_bank") {
    throw new ConflictError(
      "حساب المصدر غير مسموح للدفع — يُسمح فقط بـ main_cash أو main_bank.",
      "SETTLEMENT_SOURCE_ACCOUNT_INVALID",
      { accountId, accountType },
    );
  }
  const expectedMethod = accountType === "main_cash" ? "كاش" : "بنك";
  if (paymentMethod !== expectedMethod) {
    throw new ConflictError(
      `طريقة الدفع (${paymentMethod}) لا تطابق حساب المصدر (${accountType}). المطلوب: ${expectedMethod}.`,
      "SETTLEMENT_SOURCE_ACCOUNT_INVALID",
      { accountId, accountType, paymentMethod, expectedMethod },
    );
  }
}
