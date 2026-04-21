-- Phase 4.2.1 — BR-52 hierarchy fix.
-- Force every manager_box row to be a child of main_cash. Previously
-- ensureManagerBox (Phase 4.2) + the 0009 backfill inserted manager_box
-- rows with parent_account_id = NULL, which detaches them from the
-- canonical GM → manager_box → driver_custody chain in 12_Accounting_Rules
-- + BR-52. This migration closes the invariant in one shot:
--   - Any manager_box whose parent_account_id differs from the single
--     main_cash row (NULL, main_bank.id, or any other stale pointer) is
--     rebound to main_cash.id.
--   - Idempotent: re-running produces zero affected rows once all
--     manager_box rows point at main_cash.
--   - Safe pre-init: the EXISTS guard makes this a no-op when no
--     main_cash row has been seeded yet (fresh schema before /api/init).
UPDATE "treasury_accounts"
SET "parent_account_id" = (
  SELECT "id" FROM "treasury_accounts"
  WHERE "type" = 'main_cash'
  ORDER BY "id" ASC LIMIT 1
)
WHERE "type" = 'manager_box'
  AND "parent_account_id" IS DISTINCT FROM (
    SELECT "id" FROM "treasury_accounts"
    WHERE "type" = 'main_cash'
    ORDER BY "id" ASC LIMIT 1
  )
  AND EXISTS (SELECT 1 FROM "treasury_accounts" WHERE "type" = 'main_cash');
