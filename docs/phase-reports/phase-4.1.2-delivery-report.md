# Phase 4.1.2 Delivery Report — D-37 canonical completeness + `invoice_lines` hash chain

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: Corrective anti-fraude tranche for Phase 4.1.1. Scope strictly limited to D-37 alignment on the invoice family.

---

## 0. Implementation Contract (accepted 2026-04-21)

**Scope (exact)** — two fixes only:

1. Widen `invoices.row_hash` canonical input to cover EVERY frozen column on the row (full `vendor_snapshot`, full `payments_history`, full line-level frozen fields).
2. Apply D-37 to `invoice_lines` as a separate chain (new `prev_hash` + `row_hash` columns + migration + `HASH_CHAIN_KEYS.invoice_lines` + per-line link computed at `issueInvoiceInTx`).

**Out of scope**: treasury, settlements, avoir, new UI, wide refactor. No `vitest.config.ts` change (contract amendment §4 — touched only if Gate 5 fails; it didn't).

**Canonical decisions governing this work**:
- D-37 (00_DECISIONS.md) — `canonical(row_data)`; subsets forbidden.
- D-30 — frozen snapshot completeness on invoice row.
- D-79 — idempotency preserved on confirm-delivery.
- Phase 3.0.1 hash-chain protocol — shared `computeHashChainLink` helper.

**Invariants committed to prove**:
- I1 — any mutation of `vendor_snapshot.*` detected by `verifyInvoicesChain`.
- I2 — any mutation of `payments_history[*].*` detected by `verifyInvoicesChain`.
- I3 — any mutation of `invoice_lines.*_frozen` detected by `verifyInvoiceLinesChain`.
- I4 — same line mutation ALSO breaks `verifyInvoicesChain` (double protection).
- I5 — fresh multi-line + gift issue → both chains clean.
- I6 — idempotency replay → single invoice + both chains clean.
- I7 — two sequential issues → chains propagate cleanly.
- I0 — every line written by `issueInvoiceInTx` carries a real hex(sha256) row_hash, not the DEFAULT `''` bootstrap.

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `0cf8efe` (Phase 4.1.1)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.1.2 — D-37 canonical completeness + invoice_lines hash chain**

---

## 2. Scope

### ما تغيَّر

**Schema + migration**
- [`src/db/schema/invoices.ts`](../../src/db/schema/invoices.ts): `invoiceLines` gained `prevHash: text("prev_hash")` + `rowHash: text("row_hash").notNull().default("")`. Default `''` is a bootstrap migration compromise; every row written by `issueInvoiceInTx` carries a real hex(sha256) (enforced by test T0).
- New [`src/db/migrations/0008_invoice_lines_hash_chain.sql`](../../src/db/migrations/0008_invoice_lines_hash_chain.sql) — additive `ALTER TABLE ADD COLUMN` for both columns.

**Hash-chain registry**
- [`src/lib/hash-chain.ts`](../../src/lib/hash-chain.ts): `HASH_CHAIN_KEYS.invoice_lines = 1_000_004`. `ALLOWED_TABLES` now whitelists `"invoice_lines"` via `Object.keys(HASH_CHAIN_KEYS)`.

**Issuer (`issue.ts`)**
- [`src/modules/invoices/issue.ts`](../../src/modules/invoices/issue.ts): the invoice `canonical` input is now a full row projection:
  - identity + client snapshot + parties + payment method + all totals + vat rate (existing)
  - `vendorSnapshot: VendorSnapshot` — full 17 fields, was `vendorSiret` alone.
  - `paymentsHistory: PaymentHistoryEntry[]` — full array, was `paymentsCount` alone.
  - `lines: LineFrozen[]` — full frozen fields per line, in `line_number` order.
- After the invoice row is inserted, the per-line loop now computes each line's own `canonical`/`prevHash`/`rowHash` via `computeHashChainLink({ chainLockKey: HASH_CHAIN_KEYS.invoice_lines, tableName: "invoice_lines" }, ...)` and inserts the line with both hash columns populated. Lines within an invoice are linked in `line_number` order; across invoices the advisory lock `pg_advisory_xact_lock(1_000_004)` serializes concurrent issues.

**Verifiers** (new)
- [`src/modules/invoices/chain.ts`](../../src/modules/invoices/chain.ts): `verifyInvoicesChain(tx)` + `verifyInvoiceLinesChain(tx)`. Each walks `ORDER BY id ASC`, rebuilds `canonical` from the row data, and compares against the stored `row_hash`. Returns the id of the first corrupt row, or `null` if clean.
  - **Frozen-only guarantee** — imports are `crypto` (stdlib) + `drizzle-orm` (sql only) + `DbTx` (type) + `canonicalJSON` (stdlib-level). **No imports of `settings`, `payments`, `clients`, or `products`.** `verifyInvoicesChain` reads from the `invoices` row + its sibling `invoice_lines` rows exclusively.

**Tests** (new)
- [`tests/integration/phase-4.1.2-fixes.test.ts`](../../tests/integration/phase-4.1.2-fixes.test.ts) — 8 cases (T0..T7) mapping 1-to-1 to the invariants above. T1..T4 are **negative-first**: they tamper with `UPDATE ... jsonb_set` (or a plain column UPDATE for line fields) bypassing the D-58 trigger (trigger guards `invoice_lines` body via `reject_mutation`; for JSONB on `invoices` the trigger doesn't fire here — and that's precisely the gap the chain closes). Each tamper test asserts the verifier returns the offending row id.

**Docs**
- [`docs/requirements-analysis/02_DB_Tree.md`](../requirements-analysis/02_DB_Tree.md) §18b — `invoice_lines` table now documents `prev_hash` + `row_hash` columns + the D-37 chain note (double-detection via `verifyInvoiceLinesChain` + `verifyInvoicesChain`).
- [`docs/phase-reports/phase-4.1.1-delivery-report.md`](./phase-4.1.1-delivery-report.md): §0 Errata prepended pointing here.
- This report.

### ما لم يتغيَّر

- No `src/modules/invoices/mappers.ts` change (contract amendment §tightening — `row_hash`/`prev_hash` remain internal, not exposed on `InvoiceDto`).
- No `vitest.config.ts` change (contract amendment §4 — unit coverage unchanged after the new file; `chain.ts` is not imported by any unit source so v8 coverage does not pull it in).
- No change to routes, DTOs, PDF renderer, or any Phase 4.0/4.1/4.1.1 behavior.
- `.env.local` gitignored; no push.

---

## 3. Business Impact

- **Anti-fraude / inaltérabilité now complete on the invoice family.** Any post-issue tampering with a frozen field on an invoice — whether it's a vendor mention, a payment history entry, or a line's `line_total_ttc_frozen` — flips `verifyInvoicesChain` to fail. The same line-level tampering ALSO flips `verifyInvoiceLinesChain` to fail (double detection).
- **Audit story is closed for Phase 4.1-family invariants.** An administrator who runs a raw SQL UPDATE against `vendor_snapshot` or `payments_history` cannot hide the edit from a subsequent chain verify pass.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/db/schema/invoices.ts` (+2 cols on invoice_lines) | 0 | 1 |
| `src/db/migrations/0008_invoice_lines_hash_chain.sql` | 1 | 0 |
| `src/db/migrations/meta/*` (journal + snapshot, auto-generated) | 1 | 1 |
| `src/lib/hash-chain.ts` (+invoice_lines key) | 0 | 1 |
| `src/modules/invoices/issue.ts` (full canonical + per-line chain) | 0 | 1 |
| `src/modules/invoices/chain.ts` (frozen-only verifiers) | 1 | 0 |
| `tests/integration/phase-4.1.2-fixes.test.ts` (T0..T7) | 1 | 0 |
| `docs/requirements-analysis/02_DB_Tree.md` §18b | 0 | 1 |
| `docs/phase-reports/phase-4.1.1-delivery-report.md` (§0 Errata) | 0 | 1 |
| `docs/phase-reports/phase-4.1.2-delivery-report.md` | 1 | 0 |
| **Total** | **5 new** | **6 modified** |

All touched source files remain within the 300 code-line ESLint threshold. Largest after change: [`issue.ts`](../../src/modules/invoices/issue.ts) at 295 raw lines.

### Endpoints

None added/removed/modified. The verifiers are internal test helpers.

### Migration

New additive ALTER adding 2 columns to `invoice_lines`. Safe on a fresh Neon reset (tests) and on any empty-or-backfilled dev DB.

### Deps

None added.

---

## 5. Risk Level

**Level**: 🟡 **Medium-Low**

- The tranche extends an existing, well-understood pattern (`computeHashChainLink`) to a new table. No new concurrency primitives.
- Canonical inputs for both invoice + line chains pull data that is already written by the same tx, so the chain closure is mechanical.
- Negative-first tests prove the chains actually DO fail on tampering — not just a "code compiles" outcome.
- Rollback cost: revert the commit. Schema rollback is a `DROP COLUMN` on `invoice_lines.prev_hash` + `row_hash` (no data dependencies beyond the chain itself).

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Phase 4.1.1 → Phase 4.1.2 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | PASS 0/0. |
| 3 | Typecheck | ✅ real | PASS. |
| 4 | Build | ✅ real | PASS — routes unchanged. |
| 5 | Unit + coverage | ✅ real, exit 0 | **223/223 (26 files)**; no threshold change needed. No `vitest.config.ts` touch per contract. |
| 6 | Integration | ✅ real, live DB | **196/196 passed (25 files), zero skipped.** Previous 4.1.1 baseline 188 (24 files). Δ = +8 = the 8 new Phase 4.1.2 cases. Wall-clock 1145.85s (~19 min) on live Neon. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS (new 0008 migration). |
| 9–13 | placeholder | ⏸ | — |

### Canonical gate commands

```bash
npm run lint
npm run typecheck
npm run build
npm run db:migrate:check
npm run test:unit
npm run test:integration   # requires .env.local with TEST_DATABASE_URL
```

All from vanilla npm scripts — no shell tricks.

---

## 7. Regression Coverage

- [✅] Phase 2.* / 3.* / 4.0 / 4.0.1 / 4.0.2 / 4.1 / 4.1.1 — every existing integration file re-runs green.
- [🆕] T0 — `issueInvoiceInTx` output has real hex row_hash + prev_hash pattern.
- [🆕] T1 — vendor_snapshot tamper detected by invoice chain.
- [🆕] T2 — payments_history tamper detected by invoice chain.
- [🆕] T3 — line frozen field tamper detected by invoice_lines chain.
- [🆕] T4 — line tamper detected by BOTH chains (double protection).
- [🆕] T5 — multi-line + gift happy path clean.
- [🆕] T6 — idempotency replay: single invoice + both chains clean.
- [🆕] T7 — two sequential issues: chains propagate.

---

## 8. API Impact

- **No response body change.** `row_hash`/`prev_hash` remain internal DB columns; they are NOT exposed in `InvoiceDto`, `InvoiceLineDto`, or any route response.
- **No new error codes.** Verifier failures return a numeric row id to test code, not HTTP errors.

---

## 9. DB Impact

- New migration `0008_invoice_lines_hash_chain.sql` — adds `prev_hash TEXT` + `row_hash TEXT NOT NULL DEFAULT ''` to `invoice_lines`. `ALTER TABLE ... ADD COLUMN` only — no index, no constraint change on existing columns.
- Per-invoice issue writes add one advisory-lock acquisition on `1_000_004` + one `SELECT row_hash FROM invoice_lines ORDER BY id DESC LIMIT 1` + N inserts (N = item count including gifts). Same serialization pattern as activity_log + cancellations.

---

## 10. Security Check

- **Anti-fraude invariant strengthened.** Previous canonical subset allowed silent tampering on most frozen fields; now a single UPDATE on any frozen column breaks the chain.
- **No new trust boundaries.** Verifiers are internal — there is no endpoint that exposes row_hash values. An attacker cannot use them for stateless forgery because `canonical` depends on the previous row's hash (walk-from-genesis requirement).
- **Frozen-only guarantee enforced at the import level.** `chain.ts` imports do not pull `settings`, `payments`, `clients`, or `products` schema/module. Self-Review §11 below cites the exact import list.

---

## 11. Performance Check

- Per invoice issue: N extra advisory-lock acquisitions + N extra `SELECT last row_hash` queries (N = line count, typically single digits). Amortized against the Neon RTT this is negligible.
- Verifier walk: O(invoices + lines). Suitable for test use; a production-facing endpoint would batch by id ranges (not in scope).
- No change in the invoice read path (list / detail / pdf endpoints keep their pre-4.1.2 query shape).

---

## 12. Self-Review Findings

### What I checked exactly

Against all 8 canonical docs required by the Tranche Discipline Policy:

1. **`00_DECISIONS.md` D-37** — "hash-chain على invoices **و** invoice_lines. canonical(row_data)." Code now matches: `invoices.row_hash` covers all frozen columns; `invoice_lines` has its own chain covering all frozen columns per line. No subset.
2. **`02_DB_Tree.md` §18b** — document updated to include `prev_hash` + `row_hash` + D-37 chain note. Schema and doc now agree.
3. **`09_Business_Rules.md`** — no BR in this tranche's surface area (BR-63/BR-64/BR-67 are untouched; they govern issuance + numbering, not hash mechanics).
4. **`15_Roles_Permissions.md`** — no role access path change. Verifiers are module-level internals (test helpers), no route exposure.
5. **`16_Data_Visibility.md`** — response shapes unchanged. `row_hash`/`prev_hash` NOT on `InvoiceDto`, `InvoiceLineDto`, or any DTO returned by routes.
6. **`22_Print_Export.md`** — PDF renderer is unchanged. Still a pure function of `InvoiceDetailDto`. No read from live tables.
7. **`31_Error_Handling.md`** — no new HTTP error codes. `INVOICE_TOTAL_MISMATCH` / `INVOICE_NO_ITEMS` / `D35_READINESS_INCOMPLETE` continue to govern the issuer surface.
8. **`35_API_Endpoints.md`** — no endpoint added/changed/removed.

### Sensitive invariants in this tranche

| ID | Invariant | Proof |
|----|-----------|-------|
| I0 | every line inserted by `issueInvoiceInTx` carries real hex(sha256) `row_hash`, not the DEFAULT `''` | T0 asserts `/^[0-9a-f]{64}$/` on every `row_hash` returned for every line row after issue, for both invoice + invoice_lines rows |
| I1 | tampering with any field of `vendor_snapshot` breaks `verifyInvoicesChain` | T1 (shopIban specifically, but canonical covers every key) |
| I2 | tampering with any element of `payments_history` breaks `verifyInvoicesChain` | T2 (first entry's amount specifically, but canonical covers every entry) |
| I3 | tampering with any `*_frozen` field on an invoice_line breaks `verifyInvoiceLinesChain` | T3 (line_total_ttc_frozen specifically) |
| I4 | same line tampering ALSO breaks `verifyInvoicesChain` | T4 (ht_amount_frozen specifically, asserting both chains fail) |
| I5 | happy-path multi-line + gift issues cleanly; both chains verify | T5 |
| I6 | idempotency replay yields single invoice + both chains clean | T6 |
| I7 | two sequential issues keep chains clean (prev_hash propagates) | T7 |
| I-frozen | verifiers read from `invoices` + `invoice_lines` only | `chain.ts` imports = `crypto` / `drizzle-orm` / `@/db/client` (types) / `@/lib/hash-chain` (canonicalJSON). No `settings` / `payments` / `clients` / `products` import anywhere in the file. Static check at file level |

### How I proved each invariant

Direct integration-level assertions against the verifiers on a live Neon DB, issuing real invoices via the HTTP layer (confirm-delivery route) and then mutating the target columns directly via `tx.execute` SQL. This mirrors the real threat model: an administrator with direct DB write access attempts to alter an already-issued invoice. The verifier return value (row id vs `null`) is asserted after every tamper.

**Trigger-bypass note**: the D-58 immutability triggers (`invoices_no_update`, `invoice_lines_no_update`) already reject every ordinary UPDATE attempt. To reach the hash-chain layer — which is a SEPARATE line of defense — each negative test explicitly disables the target trigger for the duration of one UPDATE via `ALTER TABLE ... DISABLE TRIGGER ...` and re-enables it in `finally`. This simulates the threat model the chain is designed for: an operator or attacker who has stripped the trigger (dropped it, superuser access, tampered dump restore) tries to alter a frozen row. The tests then prove the chain catches them anyway.

**Chain-restoration pattern**: because the verifier walks the chain from genesis, any leftover corrupt row would fail every subsequent test. Each negative test therefore captures the original value BEFORE the tamper, asserts the verifier catches the tamper, then restores the original in `finally` (also trigger-bypassed). A second `verifyBothChains()` after restore asserts the chain is back to clean — preventing bleed-over to the happy-path tests (T5/T6/T7).

T0 additionally asserts the `DEFAULT ''` bootstrap compromise is NOT observable on any row inserted through `issueInvoiceInTx` — every row carries a real hash.

### Known gaps (non-blocking)

1. **Pre-existing doc drift** in [`02_DB_Tree.md`](../requirements-analysis/02_DB_Tree.md) §18 line 496: the note says `row_hash = SHA256(...) محسوباً عبر trigger قبل INSERT`. In practice, all three chains in the codebase (activity_log, cancellations, invoices + invoice_lines) compute the hash in the application via `computeHashChainLink`, NOT via a DB trigger. This drift pre-dates 4.1.2 (introduced at initial schema) and was not created by this tranche. Touching it is a docs-only micro-tranche; out of 4.1.2 scope per the user's "keep the patch tight" constraint. Non-blocking because the actual hashing mechanism is correct, and the chain guarantees hold regardless of where the hash is computed.
2. **No chain-verify endpoint.** `verifyInvoicesChain` / `verifyInvoiceLinesChain` are test helpers (consistent with `verifyCancellationsChain` and `verifyActivityLogChain` in the Phase 3 codebase). A user-facing verification endpoint is a Phase 6-adjacent audit feature; explicitly out of Phase 4.1.x scope.
3. **`DEFAULT ''` on `invoice_lines.row_hash`.** Per contract amendment §2, this is a bootstrap-only hack for the migration. The T0 test enforces at the behavior level that no app-written row has this value. A stricter constraint (`CHECK (row_hash ~ '^[0-9a-f]{64}$')`) is a later hardening tranche; non-blocking because an app-written row that violated the pattern would be caught by T0 immediately.

### Why each gap is non-blocking

- (1) is a pre-existing documentation artifact; the runtime behavior matches D-37 correctly. Fixing it does not change any code path.
- (2) is a feature deferral, not a deficiency; test-level coverage already exercises the verifier logic.
- (3) is enforced at runtime by T0 and by `issueInvoiceInTx`'s always-populating path. A schema CHECK is defense-in-depth, not a correctness requirement.

### Concurrency path note

`computeHashChainLink` takes a per-chain `pg_advisory_xact_lock`. Two concurrent `confirmDelivery` transactions serialize on:
- `HASH_CHAIN_KEYS.activity_log` (existing, unchanged)
- `HASH_CHAIN_KEYS.invoices` (existing, unchanged)
- `HASH_CHAIN_KEYS.invoice_lines` (new — same pattern)

Same serialization model as activity_log + cancellations, both of which have Phase 3 integration tests asserting chain integrity under serial execution. This tranche doesn't introduce a new concurrency primitive; it reuses a proven one.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green (1/2/3/4/5/6/8).

### الشروط

- Commit locally; no push per standing rule.
- Phase 4 continuation (treasury / settlements / avoir) remains blocked on reviewer approval.
- No new tranche until user acknowledges 4.1.2.

---

## 14. ملاحظة صدق

المراجع حدَّد نقطتين anti-fraude حاجزتَين، وكلتاهما صحيحة:

1. **canonical كان subset** — `paymentsCount` + `vendorSiret` فقط. تعديل `shopIban` أو أي قيمة داخل `payments_history` كان يمر بلا كسر. D-37 كنسي يطلب `canonical(row_data)` كاملة، وقد طُبِّق ذلك الآن فعلاً: كل الأعمدة المجمّدة على صف الفاتورة داخلة في الـ input، بما في ذلك `vendorSnapshot` كاملاً و`paymentsHistory` كاملاً ومصفوفة `lines` الكاملة من `invoice_lines`. اختبار T1 + T2 يثبتان أن كسر أي حقل يُكتشف.

2. **`invoice_lines` كانت خارج السلسلة** — D-37 ينص صراحة على `invoices` **و** `invoice_lines`. أُضيفت سلسلة مستقلة (`HASH_CHAIN_KEYS.invoice_lines = 1_000_004`)، بعمودَي `prev_hash` + `row_hash`، تُملأ داخل نفس tx الخاصة بـ confirm-delivery. اختبار T3 يثبت كسر سلسلة الأسطر عند التلاعب، وT4 يثبت double-detection عبر سلسلة الفاتورة الأم أيضاً (لأن `lines` داخل canonical الفاتورة).

لا shell tricks. لا push. لا توسيع نطاق. Phase 4 لم تُغلق.
