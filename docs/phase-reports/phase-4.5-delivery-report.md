# Phase 4.5 Delivery Report — Avoir core

> **Template**: D-78 §5 (13-section) + Implementation Contract + Self-Review Findings.
> **Type**: Feature tranche (Step 3 of Phase 4 closure plan). Ships the Avoir (credit note) issuance flow on top of the schema already seeded by D-38 + hash chain + immutability triggers.

---

## 0. Implementation Contract (accepted 2026-04-21 with 3 mandatory amendments)

**Scope delivered**: `POST /api/v1/invoices/[id]/avoir` with discriminated-union validation, FOR UPDATE locking on parent + existing avoir children, running-total enforcement, hash chain + D-58 integration, conditional PDF header, and 21 integration + 4 unit tests.

**Three reviewer amendments** (v2 of the contract):
1. **`avoirParent` is an independent DTO field**, not an extra key inside `VendorSnapshot` (which is a strict Zod schema in [`dto.ts:14`](../../src/modules/invoices/dto.ts#L14) whose `.parse(...)` call in [`mappers.ts:16`](../../src/modules/invoices/mappers.ts#L16) would strip or reject non-vendor fields). Exposed as `avoirParent: { refCode, date } | null` on `InvoiceDetailDto`, populated via a `LEFT JOIN` on `invoices.avoir_of_id` in `getInvoiceById`.
2. **Full parent payload** — the PDF reference line `Avoir de la facture {parentRefCode} du {parentDate}` requires BOTH fields, not refCode alone. `AvoirParent.refCode` + `AvoirParent.date` are both carried end-to-end (DTO → service → PDF).
3. **Deterministic PDF proof path** — no "if the tool is available" fallback. The header branch is extracted into a pure helper `buildInvoiceHeaderLines(invoice, avoirParent)` in [`pdf-header.ts`](../../src/modules/invoices/pdf-header.ts) with dedicated unit tests [`pdf-header.test.ts`](../../src/modules/invoices/pdf-header.test.ts) proving `AVOIR` + `parentRefCode` + `parentDate` emission. The integration-level PDF test is reduced to a `200 + application/pdf + length>0` smoke.

**Out of scope**: treasury refund flow, UI pages, client receivable balance, migration (schema already covers avoir via D-38), avoir-on-avoir, Phase 4.6+.

---

## 1. Delivery ID

- **Date**: 2026-04-21 (Europe/Paris)
- **Base commit**: `5807b3b` (Phase 4.4.1)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.5 — Avoir core**

---

## 2. Scope

### New files (6)

| File | Purpose |
|---|---|
| [`src/modules/invoices/pdf-header.ts`](../../src/modules/invoices/pdf-header.ts) | Pure helper `buildInvoiceHeaderLines(invoice, avoirParent)` → `{ title: "FACTURE"\|"AVOIR", referenceLine: string\|null }`. No pdfkit dependency. Defence-in-depth: avoir row with missing parent returns a placeholder rather than throwing. |
| [`src/modules/invoices/pdf-header.test.ts`](../../src/modules/invoices/pdf-header.test.ts) | 4 unit tests: regular invoice → FACTURE + null reference; regular with stray avoirParent → still FACTURE; avoir with parent → AVOIR + reference line containing BOTH refCode AND date with exact French phrasing; avoir with missing parent → defence label. |
| [`src/modules/invoices/avoir/permissions.ts`](../../src/modules/invoices/avoir/permissions.ts) | `assertCanIssueAvoir(claims)` — pm/gm only. |
| [`src/modules/invoices/avoir/issue.ts`](../../src/modules/invoices/avoir/issue.ts) | `performIssueAvoir(tx, parentInvoiceId, input, claims)` — main service. 11-step tx: permission → D-35 gate → lock parent → status/avoirOf checks → lock parent lines + existing children + sum credited per line → validate input set + running totals → vendorSnapshot from current settings → compute signed-negative totals with parent's frozen vat_rate → generate refCode (shared monthly counter) → insert avoir row with hash chain link → insert avoir lines with per-line chain → activity_log. |
| [`src/app/api/v1/invoices/[id]/avoir/route.ts`](../../src/app/api/v1/invoices/[id]/avoir/route.ts) | POST route: `requireRole(["pm","gm"])` + Zod + `withIdempotencyRoute({requireHeader:"required"})`. |
| [`tests/integration/phase-4.5-avoir.test.ts`](../../tests/integration/phase-4.5-avoir.test.ts) | 21 integration cases on live Neon (§7). |
| [`docs/phase-reports/phase-4.5-delivery-report.md`](./phase-4.5-delivery-report.md) | This report. |

### Modified files (9)

| File | Change |
|---|---|
| [`src/modules/invoices/dto.ts`](../../src/modules/invoices/dto.ts) | Added `AvoirParent` Zod schema (`{refCode, date}`) + extended `InvoiceDetailDto` with `avoirParent: AvoirParent \| null` at the top level (NOT inside `VendorSnapshot`). Added `IssueAvoirLineInput`, `IssueAvoirInput` (with `isTwoDecimalPrecise` refine on `quantityToCredit`), `IssueAvoirResult`. Moved `isTwoDecimalPrecise` import to top of file. |
| [`src/modules/invoices/service.ts`](../../src/modules/invoices/service.ts) | `getInvoiceById` now does `LEFT JOIN invoices parent ON parent.id = invoice.avoir_of_id` via Drizzle's `alias(invoices, "parent_invoice")`, returning `avoirParent` on the DTO. |
| [`src/modules/invoices/pdf.ts`](../../src/modules/invoices/pdf.ts) | Inline header branch replaced with `buildInvoiceHeaderLines(inv, detail.avoirParent)`. When the helper emits a reference line, it renders at fontSize 9 below the title, before the standard N°/date/method block. |
| [`vitest.config.ts`](../../vitest.config.ts) | `src/modules/invoices/avoir/issue.ts` added to coverage exclude list (integration-tested). |
| [`docs/requirements-analysis/00_DECISIONS.md`](../requirements-analysis/00_DECISIONS.md) | D-38 expanded with 5 issuance rules + PDF payload decision + bookkeeping-only clarification + hash-chain/D-58 preservation. |
| [`docs/requirements-analysis/09_Business_Rules.md`](../requirements-analysis/09_Business_Rules.md) | New "قواعد الـ Avoir" section with 12 rules (BR-AV-1..BR-AV-12). |
| [`docs/requirements-analysis/12_Accounting_Rules.md`](../requirements-analysis/12_Accounting_Rules.md) | New "Avoir (D-38 + Phase 4.5 — bookkeeping فقط)" sub-section documenting no-treasury-movement invariant + refund-flow deferred pattern + P&L/receivable impact. |
| [`docs/requirements-analysis/15_Roles_Permissions.md`](../requirements-analysis/15_Roles_Permissions.md) | New row "إصدار Avoir" (pm/gm only). |
| [`docs/requirements-analysis/22_Print_Export.md`](../requirements-analysis/22_Print_Export.md) | New "Avoir PDF" sub-section: title/reference-line rendering + signed amounts + pure-helper architecture + `avoirParent` payload note. |
| [`docs/requirements-analysis/31_Error_Handling.md`](../requirements-analysis/31_Error_Handling.md) | 4 new codes: `INVOICE_NOT_ISSUABLE_AVOIR` (409), `AVOIR_ON_AVOIR_NOT_ALLOWED` (409), `INVALID_AVOIR_LINE_SET` (400), `AVOIR_QTY_EXCEEDS_REMAINING` (409). `D35_READINESS_INCOMPLETE` (412) reused. |
| [`docs/requirements-analysis/35_API_Endpoints.md`](../requirements-analysis/35_API_Endpoints.md) | `/api/v1/invoices/[id]/avoir` POST row rewritten with full body/response/error spec. |

### What did NOT change

- No schema / migration (D-38 column + CHECK constraint already in 0000_initial_schema).
- No `invoices.status` lifecycle changes (still `مؤكد | ملغي`).
- No changes to `issueInvoiceInTx`, `generateInvoiceRefCode`, `chain.ts`, `d35-gate.ts`, `snapshots.ts`.
- No new `treasury_movements` category.
- No `VendorSnapshot` touched.
- No UI page.
- No push.

---

## 3. Business Impact

- **pm/gm can legally issue credit notes via API**. A French commercial reality — returns, disputes, partial refunds — now has a first-class, legally compliant flow in the system.
- **Every avoir is hash-chained + immutable**. Same D-37 + D-58 guarantees as regular invoices. Tampering with an issued avoir is detectable via `verifyInvoicesChain`.
- **Running-total enforcement prevents over-refund**. Two parallel full-reverses of the same invoice cannot both succeed (proven by T-AV-CONC); one wins, the other is rejected with a semantically-correct 409.
- **PDF is compliant**: `AVOIR` title + mandatory French reference `Avoir de la facture <ref> du <date>` + all D-35 mentions preserved in `vendorSnapshot`.
- **Bookkeeping scope is honest**. No treasury_movement is written at issue time; the docs explicitly state that cash refund (if any) is a separate tranche. No ambiguous "did cash move?" state.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| src/modules/invoices | 4 (pdf-header.ts + .test.ts + avoir/permissions.ts + avoir/issue.ts) | 3 (dto, service, pdf) |
| src/app/api/v1 | 1 | 0 |
| tests/integration | 1 | 0 |
| vitest.config.ts | 0 | 1 |
| docs | 1 | 7 |
| **Total** | **7 new** | **11 modified** |

All touched files ≤ 300 effective lines (ESLint `max-lines` passes). The largest new file is `avoir/issue.ts` at 338 raw lines; well under threshold for effective lines.

### Endpoints

- **New**: `POST /api/v1/invoices/[id]/avoir` (pm/gm, Idempotency-Key required).
- **Changed shape (additive only)**: `GET /api/v1/invoices/[id]` now returns `avoirParent` field. `null` for regular invoices (no break). Clients consuming the endpoint gain the field without needing to re-parse; the JSON shape is strictly a superset.

### Migration

**None**. The `invoices.avoir_of_id` column + `invoices_avoir_negative_check` CHECK constraint were added in `0000_initial_schema.sql`. The invoice_lines signed-quantity support is inherent (`numeric(19,2)` with no CHECK).

### Deps

None.

---

## 5. Risk Level

**Level**: 🟡 **Medium-low**.

- New tx writes into the existing `invoices` + `invoice_lines` tables, which are protected by D-58 immutability triggers + D-37 hash chain. Any arithmetic or insert bug surfaces as a chain-verification failure (T-AV-CHAIN covers this).
- The running-total guard + FOR UPDATE pattern is proven under concurrency (T-AV-CONC).
- PDF rendering changes are gated by a pure-function helper with unit tests.
- Rollback: revert the commit. No schema state to undo.

---

## 6. Tests Run (Local — 2026-04-21)

### 13-gate status

| # | Gate | Type | Result |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | **PASS 0/0**. |
| 3 | Typecheck | ✅ real | **PASS**. |
| 4 | Build | ✅ real | **PASS** — new route + modified pages compile. |
| 5 | Unit + coverage | ✅ real | **228/228** (224 baseline + 4 new `pdf-header` cases), coverage thresholds preserved. |
| 6 | Integration | ✅ real, live Neon | **297/297 passed (32 files), zero skipped.** 276 baseline + 21 new Phase 4.5 cases. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS (no new migrations). |
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

All from vanilla npm scripts.

---

## 7. Regression Coverage

All 21 Phase 4.5 cases (integration) + 4 pdf-header cases (unit):

**Happy** (4): T-AV-FULL, T-AV-PARTIAL-ONE-LINE, T-AV-PARTIAL-MULTI, T-AV-SEQUENTIAL.

**Negative** (10): T-AV-NEG-NOT-FOUND (404), T-AV-NEG-CANCELLED-PARENT (409 `INVOICE_NOT_ISSUABLE_AVOIR`), T-AV-NEG-AVOIR-ON-AVOIR (409 `AVOIR_ON_AVOIR_NOT_ALLOWED`), T-AV-NEG-LINE-NOT-IN-INVOICE (400), T-AV-NEG-LINE-DUPLICATE (400), T-AV-NEG-QTY-EXCEEDS (409), T-AV-NEG-QTY-EXCEEDS-SEQUENTIAL (409), T-AV-NEG-REASON-EMPTY (400), T-AV-NEG-QTY-SUBCENT (400 via `isTwoDecimalPrecise`), T-AV-NEG-EMPTY-LINES (400).

**D-35** (1): T-AV-NEG-D35 (412 with zero avoir inserted).

**Permissions** (1): T-AV-PERM (manager/seller/driver/stock_keeper → 403; pm & gm → 200).

**Idempotency** (1): T-AV-IDEM (exactly 1 avoir row on replay).

**Concurrency** (1): T-AV-CONC (2 parallel full-reverses → 1 × 200, 1 × 409 `AVOIR_QTY_EXCEEDS_REMAINING`).

**Chain + D-58** (2): T-AV-CHAIN (`verifyInvoicesChain` + `verifyInvoiceLinesChain` both return `null` after issue); T-AV-D58 (UPDATE on avoir rejected by trigger).

**PDF** (1): T-AV-PDF (200 + `Content-Type: application/pdf` + buf.byteLength > 500). Branch logic proof lives unit-level.

**pdf-header unit** (4): regular → FACTURE + null ref; regular with stray avoirParent → still FACTURE (avoirOfId null wins); avoir → "AVOIR" + `Avoir de la facture FAC-2026-04-0023 du 2026-04-15` (both fields verified); avoir with missing parent → defence label.

**Full regression**: 276 baseline + 21 new = 297 integration tests on live Neon, all pass. No existing test modified.

---

## 8. API Impact

### Added
- `POST /api/v1/invoices/[id]/avoir` — pm/gm only, Idempotency-Key required.

### Shape change (additive)
- `GET /api/v1/invoices/[id]` response now carries `avoirParent: { refCode, date } | null`. For regular invoices always `null`.

### Behaviour change (PDF)
- `GET /api/v1/invoices/[id]/pdf` on an avoir now emits `AVOIR` title + French reference line. Regular invoices unchanged.

---

## 9. DB Impact

None. Existing schema covers avoir (D-38 from day-0).

---

## 10. Security Check

- `requireRole(["pm","gm"])` at route + `assertCanIssueAvoir(claims)` at service — defence-in-depth.
- D-35 gate runs before any DB mutation — incomplete vendor block cannot produce a legally defective PDF.
- Parent invoice lock (FOR UPDATE) prevents race where the parent is cancelled between read and avoir insert.
- Running-total guard locks BOTH parent lines AND existing avoir children, so concurrent callers serialize on the same (parent, line) key.
- CHECK constraint at the DB level backs up the service-layer sign assertion (defence against a future tx that bypasses the service).
- Hash chain makes post-hoc tampering detectable; D-58 trigger prevents `UPDATE` altogether.

---

## 11. Performance Check

- Per avoir issuance: 1 `SELECT FOR UPDATE` on parent, 1 on parent lines, 1 on existing children, 1 aggregate SQL to sum credited per line, 1 `generateInvoiceRefCode` (advisory-locked UPSERT), 1 hash chain lookup per row (1 + N), 1 invoice insert, N line inserts, 1 activity_log insert. For a typical 3-line invoice: ~12 statements per tx. No N+1 queries.
- `GET /api/v1/invoices/[id]` gained a LEFT JOIN on self — index on `invoices.id` PK already covers it. No measurable cost change.
- PDF render gained one helper call + (on avoir) one `doc.text` + `doc.fontSize` swap. Microseconds.

---

## 12. Self-Review Findings

### What I checked exactly

- **`VendorSnapshot` purity preserved** — grep for `avoirParent` inside `VendorSnapshot` schema: zero hits. The field lives on `InvoiceDetailDto` top-level, and `mappers.ts:invoiceRowToDto` is unchanged (still parses `vendorSnapshot` via its strict Zod schema).
- **Parent payload completeness** — `AvoirParent` is `{ refCode: string, date: string }`, both mandatory. Service populates both from the LEFT JOIN. PDF helper test asserts the exact string `Avoir de la facture FAC-2026-04-0023 du 2026-04-15` containing BOTH.
- **PDF proof is deterministic** — `buildInvoiceHeaderLines` is a pure sync function (no DB, no pdfkit). 4 unit tests cover every branch including defence-in-depth path. Integration test on the real HTTP endpoint asserts 200 + content-type + buffer length, no fragile text extraction.
- **Idempotency under replay** — T-AV-IDEM asserts same `avoir.id` twice AND exactly 1 live avoir row in the DB after both calls.
- **Concurrency** — T-AV-CONC runs two parallel POSTs with distinct Idempotency-Keys (so they don't collapse to a cached replay) but identical bodies. FOR UPDATE serializes them; one sees `alreadyCredited = 0 → proceeds`, the other sees `alreadyCredited = full qty → rejects`.
- **Chain verify after issue** — T-AV-CHAIN runs `verifyInvoicesChain` + `verifyInvoiceLinesChain` after a 2-line full reverse; both return `null` (healthy). Proves avoir rows + lines link into the existing D-37 chain without disturbing the parent.
- **D-58 trigger still active** — T-AV-D58 attempts `UPDATE invoices SET status='ملغي' WHERE id=<avoir>`; the trigger rejects with a DB error. Avoir is append-only like every other invoice.
- **Bookkeeping-only** — code grep for `treasury_movements` inside `src/modules/invoices/avoir/`: zero hits. Service inserts to `invoices` + `invoice_lines` + `activity_log` only.
- **D-35 gate applies** — T-AV-NEG-D35 removes `shop_siret` setting, POST → 412, DB count of child avoirs for the parent unchanged.

### Invariants — proof mapping

| ID | Invariant | Proof |
|----|-----------|-------|
| I-avoir-signed | Every avoir row + its lines carry negative totals | CHECK constraint + service `if (totalTtc >= 0) throw` + T-AV-FULL asserts `totalTtcFrozen == -300`, `quantity == -1`, etc. |
| I-avoir-on-avoir-blocked | Cannot issue avoir on an avoir | T-AV-NEG-AVOIR-ON-AVOIR returns 409 `AVOIR_ON_AVOIR_NOT_ALLOWED` |
| I-avoir-parent-must-be-confirmed | `parent.status='مؤكد'` required | T-AV-NEG-CANCELLED-PARENT (with trigger-disable workaround to flip state) returns 409 `INVOICE_NOT_ISSUABLE_AVOIR` |
| I-running-total | SUM credited ≤ parent line qty under FOR UPDATE | T-AV-NEG-QTY-EXCEEDS + T-AV-NEG-QTY-EXCEEDS-SEQUENTIAL + T-AV-CONC all verify the 409 under different access patterns |
| I-d35-applies | D-35 gate runs before any insert | T-AV-NEG-D35 asserts 412 AND zero child rows added |
| I-line-set-uniform | lines belong to parent + no duplicates | T-AV-NEG-LINE-NOT-IN-INVOICE + T-AV-NEG-LINE-DUPLICATE both 400 `INVALID_AVOIR_LINE_SET` |
| I-chain-preserved | Avoir joins the invoices + invoice_lines chains cleanly | T-AV-CHAIN: both verifiers return null after a 2-line full reverse |
| I-d58-on-avoir | Avoir row UPDATE rejected by trigger | T-AV-D58 expects the tx to reject |
| I-idempotent | Replay returns identical response + single row | T-AV-IDEM |
| I-pdf-branch-total | PDF header carries AVOIR + both parent fields for an avoir | pdf-header unit tests assert exact string + `.toContain(refCode)` + `.toContain(date)` |
| I-vendor-snapshot-purity | `avoirParent` is NOT in `VendorSnapshot` | File inspection: `VendorSnapshot` schema unchanged from Phase 4.1.1. `avoirParent` lives on `InvoiceDetailDto` top-level. |
| I-no-treasury-movement | Avoir issue writes no treasury_movement | Grep: `src/modules/invoices/avoir/` does not import `treasuryMovements`. |

### Known gaps (non-blocking)

1. **Cash refund flow is out of scope for 4.5**. An issued avoir creates a negative-invoice liability; settling it in cash (driver cash, SEPA, etc.) is a separate future tranche. Documented explicitly in `12_Accounting_Rules.md`.
2. **No UI for avoir issuance**. `/invoices` pages are not part of Phase 4 scope. pm/gm drive this via direct POST for now.
3. **T-AV-NEG-CANCELLED-PARENT uses a trigger-disable + UPDATE workaround** to flip the parent's status to `ملغي`, because the system has no user-facing "cancel invoice" endpoint. The workaround restores the trigger + status at the end of the test so later cases run on a clean chain. This is a test-infrastructure accommodation, not a production code path.
4. **`client_balance` / accounts receivable** is still derived on-the-fly from payments. With avoirs in the system, a proper A/R report needs to JOIN `invoices` (including avoirs) + `payments`. Out of scope for 4.5; the docs make this explicit.

### Why each gap is non-blocking

- (1) refund flow is explicitly deferred per the reviewer's accepted contract — cash outflow on avoir would require design decisions (which account? refund policy? driver involvement?) that weren't committed in 4.5.
- (2) UI is post-Phase-4.
- (3) the workaround is isolated to one test file, wrapped in a restore step; no production code depends on it.
- (4) A/R reporting is a dedicated read-path tranche, not a correctness bug.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green + 21/21 Phase 4.5 integration + 4/4 pdf-header unit + zero regression on 276 existing integration tests.

### الشروط

- Commit محلي فقط.
- Phase 4 closure pack (Step 4 — docs-only consolidation) لا يبدأ قبل مراجعة صريحة لهذا الـ 4.5.

---

## 14. ملاحظة صدق

الترانش نفَّذت النطاق المُعتمَد مع التعديلات الثلاث الإلزامية من مراجعة العقد:

1. **`avoirParent` حقل مستقل** على `InvoiceDetailDto` — لم يُلمس `VendorSnapshot` (صفّ `mappers.ts:16` مع `VendorSnapshot.parse(...)` يبقى كما هو). الـ payload يُحمَّل من self-join في `getInvoiceById` وسبنزه في `renderInvoicePdf` كحقل مرجعي منفصل.

2. **Payload كامل**: `avoirParent: { refCode, date }` — الاثنان إلزاميان. الـ PDF reference line يحمل `Avoir de la facture FAC-YYYY-MM-NNNN du YYYY-MM-DD`. unit tests في `pdf-header.test.ts` تؤكد الاثنين صراحةً بـ `.toContain(refCode)` + `.toContain(date)`.

3. **PDF proof path حتمي**: `buildInvoiceHeaderLines` helper نقي مع 4 unit tests — لا اعتماد على استخراج نص PDF في الـintegration، لا "إذا توفرت الأداة". الـ integration في T-AV-PDF يكتفي بـ 200 + Content-Type + byteLength>500 (smoke) لأن الفرع الحسّاس مُبرهن unit-level.

النطاق: `POST /api/v1/invoices/[id]/avoir` (pm/gm، Idempotency-Key إلزامي) + PDF conditional header + docs sync على 7 ملفات. لا migration، لا treasury_movement، لا UI، لا schema change. 21 integration test + 4 unit test، كلها خضراء. 276 → 297 integration على Neon حيّ، صفر regression.

لا push.
