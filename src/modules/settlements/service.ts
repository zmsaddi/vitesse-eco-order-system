import type { DbTx } from "@/db/client";
import type { CreateSettlementInput } from "./dto";
import {
  performSettlementPayout,
  type SettlementPayoutResult,
} from "./payout";
import { performRewardPayout, type RewardPayoutResult } from "./reward";
import type { SettlementClaims } from "./permissions";

// Phase 4.4 — thin dispatcher for `POST /api/v1/settlements`. The
// discriminated-union input selects settlement vs reward at the route layer;
// this module just forwards to the right payout fn. Read-side handlers live
// in `./list.ts` and are re-exported below so existing `@/modules/settlements/service`
// imports in routes + pages keep working.

export {
  performSettlementPayout,
  type SettlementPayoutResult,
} from "./payout";
export { performRewardPayout, type RewardPayoutResult } from "./reward";
export { listSettlements, listBonuses } from "./list";

export async function performCreateSettlement(
  tx: DbTx,
  input: CreateSettlementInput,
  claims: SettlementClaims,
): Promise<
  | { kind: "settlement"; result: SettlementPayoutResult }
  | { kind: "reward"; result: RewardPayoutResult }
> {
  if (input.kind === "settlement") {
    const result = await performSettlementPayout(tx, input, claims);
    return { kind: "settlement", result };
  }
  const result = await performRewardPayout(tx, input, claims);
  return { kind: "reward", result };
}
