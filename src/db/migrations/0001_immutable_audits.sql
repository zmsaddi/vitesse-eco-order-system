-- D-58: Immutability triggers on append-only audit tables.
-- Rejects UPDATE on activity_log, cancellations, price_history, treasury_movements, invoices, invoice_lines.
-- DELETE remains allowed (cron retention path on activity_log / voice_logs); UPDATE is hard-rejected.

-- ═══════════════════════════════════════════════════════════
-- 1. Generic rejection function
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'row is immutable — UPDATE forbidden on %', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════
-- 2. Apply to append-only tables (D-58)
-- ═══════════════════════════════════════════════════════════

-- activity_log
DROP TRIGGER IF EXISTS activity_log_no_update ON activity_log;
CREATE TRIGGER activity_log_no_update
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- cancellations
DROP TRIGGER IF EXISTS cancellations_no_update ON cancellations;
CREATE TRIGGER cancellations_no_update
  BEFORE UPDATE ON cancellations
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- price_history
DROP TRIGGER IF EXISTS price_history_no_update ON price_history;
CREATE TRIGGER price_history_no_update
  BEFORE UPDATE ON price_history
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- treasury_movements
DROP TRIGGER IF EXISTS treasury_movements_no_update ON treasury_movements;
CREATE TRIGGER treasury_movements_no_update
  BEFORE UPDATE ON treasury_movements
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- invoices (D-37 hash chain + D-58) — blocks UPDATE but allows soft-cancel via status (handled in service layer via separate row mechanism, or explicit allowlist if needed later).
-- Phase 0: strict no-update. Phase 4 re-evaluates if Avoir flow requires controlled exceptions.
DROP TRIGGER IF EXISTS invoices_no_update ON invoices;
CREATE TRIGGER invoices_no_update
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- invoice_lines (D-30 frozen + D-58)
DROP TRIGGER IF EXISTS invoice_lines_no_update ON invoice_lines;
CREATE TRIGGER invoice_lines_no_update
  BEFORE UPDATE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ═══════════════════════════════════════════════════════════
-- 3. Hash chain helper (D-37) — computed client-side in Phase 4+.
--    This SQL function exposes the canonicalization + SHA256
--    computation for verification queries without reimplementing
--    logic in app code.
-- ═══════════════════════════════════════════════════════════

-- Enable pgcrypto for digest() — Neon Free tier supports it.
-- MUST come BEFORE the function below: Postgres type-checks SQL
-- function bodies at CREATE time, so digest() must already exist.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION compute_row_hash(prev_hash TEXT, canonical_data TEXT)
  RETURNS TEXT AS $$
  SELECT encode(digest(convert_to(COALESCE(prev_hash, '') || canonical_data, 'UTF8'), 'sha256'), 'hex');
$$ LANGUAGE SQL IMMUTABLE;
