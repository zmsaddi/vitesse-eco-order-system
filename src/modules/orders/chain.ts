import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { canonicalJSON } from "@/lib/hash-chain";

// Phase 3.0.1: cancellations hash-chain verifier (test helper).
// Mirrors verifyActivityLogChain. The cancellations table also tracks
// (prev_hash, row_hash); production writes go through computeHashChainLink in
// @/lib/hash-chain; this function just replays the hash and reports the first
// corrupt row id (or null if intact).

type CancellationRow = {
  id: number;
  order_id: number;
  cancelled_by: string;
  reason: string;
  refund_amount: string;
  return_to_stock: number;
  seller_bonus_action: string;
  driver_bonus_action: string;
  prev_hash: string | null;
  row_hash: string;
};

export async function verifyCancellationsChain(tx: DbTx): Promise<number | null> {
  const res = await tx.execute(sql`
    SELECT id, order_id, cancelled_by, reason, refund_amount, return_to_stock,
           seller_bonus_action, driver_bonus_action, prev_hash, row_hash
    FROM cancellations ORDER BY id ASC
  `);
  const rows = (res as unknown as { rows?: CancellationRow[] }).rows ?? [];

  let expectedPrev: string | null = null;
  for (const r of rows) {
    if ((r.prev_hash ?? null) !== expectedPrev) return r.id;
    const canonical = canonicalJSON({
      cancelledBy: r.cancelled_by,
      driverBonusAction: r.driver_bonus_action,
      orderId: r.order_id,
      reason: r.reason,
      refundAmount: Number(r.refund_amount),
      returnToStock: r.return_to_stock,
      sellerBonusAction: r.seller_bonus_action,
    });
    const expected = crypto
      .createHash("sha256")
      .update((r.prev_hash ?? "") + "|" + canonical, "utf8")
      .digest("hex");
    if (expected !== r.row_hash) return r.id;
    expectedPrev = r.row_hash;
  }
  return null;
}
