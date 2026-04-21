-- Phase 4.4 — settlements.applied + applied_in_settlement_id.
--
-- Context: cancel_as_debt writes a settlements row with type='debt', amount<0
-- and applied=false. A later type='settlement' payout for the same recipient
-- "consumes" every unapplied debt row atomically (all-or-nothing) by setting
-- applied=true + applied_in_settlement_id=<new settlement>. This closes the
-- bookkeeping loop that was left implicit in Phase 6 notes — the column
-- makes debt consumption observable and prevents double-consumption under
-- concurrency (combined with FOR UPDATE locks in performSettlementPayout).

ALTER TABLE "settlements" ADD COLUMN "applied" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "applied_in_settlement_id" integer;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_applied_in_settlement_id_fk"
  FOREIGN KEY ("applied_in_settlement_id") REFERENCES "public"."settlements"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Invariant: only debt rows can ever carry applied=true. settlement/reward
-- rows have no semantic "applied" state — the flag is meaningless there.
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_applied_only_for_debt"
  CHECK ( NOT applied OR type = 'debt' );--> statement-breakpoint
-- Invariant: applied_in_settlement_id is populated iff applied=true.
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_applied_in_iff_applied"
  CHECK (
    (applied = false AND applied_in_settlement_id IS NULL)
    OR
    (applied = true  AND applied_in_settlement_id IS NOT NULL)
  );--> statement-breakpoint
-- Hot-path index for performSettlementPayout's "lock unapplied debts for
-- (user_id, role)" step. Partial so the index stays tight.
CREATE INDEX IF NOT EXISTS "idx_settlements_unapplied_debt"
  ON "settlements" (user_id, role)
  WHERE type = 'debt' AND applied = false AND deleted_at IS NULL;
