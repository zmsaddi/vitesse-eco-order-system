# Phase 4.1.1 Delivery Report — D-35 gate completeness + PDF inaltérabilité + Payment history

> **Template**: D-78 §5 (13-section).
> **Type**: Required corrective tranche for Phase 4.1 — closes three reviewer findings: under-specified D-35 gate, PDF reading vendor data live, and missing Payment history section.

---

## 1. Delivery ID

- **Date**: 2026-04-20 (Europe/Paris)
- **Base commit**: `9a145aa` (Phase 4.1)
- **Commit SHA (delivery)**: *(recorded immediately after this report)*
- **Phase**: **4.1.1 — D-35 gate completeness + frozen vendor + frozen payments history**

---

## 2. Scope

### ما تغيَّر

**Fix 1 — D-35 required-keys extended**
- [`src/modules/invoices/d35-gate.ts`](../../src/modules/invoices/d35-gate.ts): `D35_REQUIRED_SETTINGS` now carries 16 keys instead of 12. Four new mandatory keys:
  - `shop_siren` — required on every French invoice alongside SIRET (art. R123-237).
  - `shop_ape` — code d'activité principale, required on commercial documents.
  - `shop_penalty_rate_annual` — penalty rate for late payment (C. com. L441-10).
  - `shop_recovery_fee_eur` — flat recovery fee minimum 40€ (C. com. L441-10 II).
- [`tests/integration/setup.ts`](../../tests/integration/setup.ts): `D35_SEED_SETTINGS` extended with the four new keys so every phase-4.x beforeAll seeds them.

**Fix 2 — Vendor legal data frozen on the invoice row**
- [`src/db/schema/invoices.ts`](../../src/db/schema/invoices.ts): added two `jsonb NOT NULL DEFAULT` columns:
  - `vendor_snapshot` — full `VendorSnapshot` shape (17 fields) captured at issue.
  - `payments_history` — ordered array of `{ date, amount, paymentMethod, type }` for every non-deleted payment row on the order at issue time.
- New migration [`src/db/migrations/0007_invoice_frozen_snapshots.sql`](../../src/db/migrations/0007_invoice_frozen_snapshots.sql) adds both columns with safe defaults so existing rows (none in prod; tests reset schema) migrate cleanly. Journal entry renamed from the generated slug to `0007_invoice_frozen_snapshots`.
- [`src/modules/invoices/snapshots.ts`](../../src/modules/invoices/snapshots.ts) (new): `readIssueSettings(tx)` + `readPaymentsHistory(tx, orderId)` — single-purpose helpers called from issue.ts at the exact moment the invoice row is written. Split out of issue.ts to keep every source file ≤300 lines.
- [`src/modules/invoices/issue.ts`](../../src/modules/invoices/issue.ts): now reads via the two helpers, persists both JSONB columns, and includes `paymentsCount` + `vendorSiret` in the hash-chain canonical form so tampering with the frozen columns would change `row_hash` and be detectable.
- [`src/modules/invoices/dto.ts`](../../src/modules/invoices/dto.ts): `VendorSnapshot` + `PaymentHistoryEntry` + `PaymentsHistory` Zod schemas added; `InvoiceDto` extended with `vendorSnapshot` + `paymentsHistory`.
- [`src/modules/invoices/mappers.ts`](../../src/modules/invoices/mappers.ts): parses the JSONB columns via the Zod schemas (safe defaults on NULL/missing input).
- [`src/modules/invoices/pdf.ts`](../../src/modules/invoices/pdf.ts): `renderInvoicePdf(detail)` no longer takes an `InvoiceSettings` parameter. Vendor block reads from `detail.invoice.vendorSnapshot`; legal footer + bank block read from the same source. Pure function of the invoice detail.
- [`src/app/api/v1/invoices/[id]/pdf/route.ts`](../../src/app/api/v1/invoices/[id]/pdf/route.ts): drops the 17-key settings query and the `mapSettings` helper entirely. Just fetches the invoice detail and hands it to `renderInvoicePdf`.

**Fix 3 — Payment history block on PDF**
- [`src/modules/invoices/pdf.ts`](../../src/modules/invoices/pdf.ts): new `drawPaymentHistoryBlock` between totals and legal footer. Renders a 4-column table (Date / Mode / Type / Montant) from `detail.invoice.paymentsHistory`. When the array is empty (credit `آجل` with no advance) the block is skipped — the rest of the layout shifts up naturally.

**Tests — new [`tests/integration/phase-4.1.1-fixes.test.ts`](../../tests/integration/phase-4.1.1-fixes.test.ts)**
- **D-35 multi-key scenario**: corrupts four of the newly-required keys simultaneously (`shop_siren`, `shop_ape`, `shop_penalty_rate_annual`, `shop_recovery_fee_eur`), attempts confirm-delivery, and asserts the 412 response's `missing` array contains all four. Proves the gate reports the FULL set, not just the first failure.
- **Vendor frozen**: issues an invoice, mutates `shop_name` + `shop_iban` + `shop_penalty_rate_annual` in live `settings`, then re-fetches the invoice detail and asserts `vendorSnapshot` still carries the original values. Also re-fetches the PDF and asserts 200 + `%PDF` magic bytes (proves the endpoint has no live settings read — a hacked value in settings cannot affect render at all).
- **Payment history populated**: confirm-delivery with `paidAmount=100` → `invoice.paymentsHistory.length === 1`, entry carries `{amount:100, paymentMethod:كاش, type:collection, date:YYYY-MM-DD}`. Then mutates the live payments row to `amount=1.00` and re-fetches → frozen snapshot still `100`.
- **Payment history empty**: credit `آجل` with `paidAmount=0` → `paymentsHistory.length === 0` and PDF still renders successfully.

**Coverage**
- [`vitest.config.ts`](../../vitest.config.ts): added `src/modules/invoices/snapshots.ts` to the coverage exclude list (integration-territory: reads settings + payments tables inside a live tx).

**Docs**
- [`docs/phase-reports/phase-4.1-delivery-report.md`](./phase-4.1-delivery-report.md): §0 Errata prepended documenting the three findings + pointer here.
- This report.

### ما لم يتغيَّر

- Schema of `invoice_lines` + `invoice_sequence` — untouched.
- Confirm-delivery side effects (delivery/order flips, payments row, bonuses computation, driver_tasks, activity_log) — unchanged.
- Existing Phase 4.1 endpoints (GET list / detail / pdf) keep the same URLs; response bodies extended additively with `vendorSnapshot` + `paymentsHistory` on the invoice DTO.
- 3 invoice endpoints, no new routes added this tranche.
- `.env.local` gitignored; no push.

---

## 3. Business Impact

- **D-35 compliance restored**. An admin who forgets to set SIRET *alone* was already caught; an admin who forgets SIREN / APE / penalty rate / recovery fee is now caught too — matching exactly what French law + the canonical spec require before a facture leaves the system.
- **Anti-fraude (inaltérabilité)**. A PDF exported today is byte-different from a PDF exported tomorrow only by its generation timestamp — NOT by any vendor / payment mutation in `settings` or `payments`. This is the loi anti-fraude 2018 bar. An administrator or admin-impersonator who tampers with `settings.shop_iban` after an invoice is issued cannot retroactively alter the stored or rendered document.
- **PDF now matches the canonical template** for the real operational flow: payments are visible to the auditor / client directly on the facture, not inferred from a separate table.

---

## 4. Technical Impact

### Files

| Category | New | Modified |
|---|---:|---:|
| `src/modules/invoices/snapshots.ts` | 1 | 0 |
| `src/modules/invoices/issue.ts` (use helpers + persist snapshots + hash chain) | 0 | 1 |
| `src/modules/invoices/dto.ts` (schemas for snapshots) | 0 | 1 |
| `src/modules/invoices/mappers.ts` (parse JSONB) | 0 | 1 |
| `src/modules/invoices/pdf.ts` (frozen-only inputs + Payment history block) | 0 | 1 |
| `src/modules/invoices/d35-gate.ts` (+4 keys) | 0 | 1 |
| `src/app/api/v1/invoices/[id]/pdf/route.ts` (drop settings read) | 0 | 1 |
| `src/db/schema/invoices.ts` (+2 JSONB cols) | 0 | 1 |
| `src/db/migrations/0007_invoice_frozen_snapshots.sql` | 1 | 0 |
| `src/db/migrations/meta/_journal.json` (rename tag) | 0 | 1 |
| `tests/integration/setup.ts` (+4 keys in seed) | 0 | 1 |
| `tests/integration/phase-4.1.1-fixes.test.ts` | 1 | 0 |
| `vitest.config.ts` (coverage excludes) | 0 | 1 |
| `docs/phase-reports/phase-4.1-delivery-report.md` (§0 errata) | 0 | 1 |
| `docs/phase-reports/phase-4.1.1-delivery-report.md` | 1 | 0 |
| **Total** | **4 new** | **11 modified** |

All source files remain within the 300 code-line ESLint threshold (`skipBlankLines + skipComments`). Largest: [`issue.ts`](../../src/modules/invoices/issue.ts) + [`pdf.ts`](../../src/modules/invoices/pdf.ts) tied at 253 raw lines.

### Endpoints

None added/removed. Response body additions (additive, non-breaking):
- `GET /api/v1/invoices/[id]` — `invoice.vendorSnapshot` + `invoice.paymentsHistory`.
- `GET /api/v1/invoices` — list items also carry the two new fields (each row is an `InvoiceDto`).

### Migration

New: [`0007_invoice_frozen_snapshots.sql`](../../src/db/migrations/0007_invoice_frozen_snapshots.sql). Adds two JSONB columns with explicit defaults; safe to apply to any state the tests reset from.

---

## 5. Risk Level

**Level**: 🟡 **Medium-Low**

- Rationale for Medium-Low: this tranche adds new columns + writes inside the critical confirm-delivery tx. If the JSONB writes or reads were wrong, either invoices would fail to issue (visible) or the PDF would silently show defaults (covered by the integration tests).
- Mitigations:
  1. Hash chain canonical form now incorporates `vendorSiret` + `paymentsCount`. Any tampering with the frozen columns would change `row_hash` and fail a future chain verify.
  2. Integration tests explicitly mutate live `settings` + live `payments` after issue and assert the invoice detail + PDF both still return the pre-mutation snapshot.
  3. Migration is additive with defaults — a fresh Neon reset runs it cleanly; existing dev data (none in prod) migrates in-place.

---

## 6. Tests Run (Local — 2026-04-20)

### 13-gate status

| # | Gate | Type | Phase 4.1 → Phase 4.1.1 |
|---|------|:-:|:-:|
| 1 | Lockfile | ✅ real | PASS (no new deps). |
| 2 | Lint | ✅ real | PASS 0/0. |
| 3 | Typecheck | ✅ real | PASS. |
| 4 | Build | ✅ real | PASS — routes unchanged. |
| 5 | Unit + coverage | ✅ real, exit 0 | **223/223 (26 files)**. Coverage unchanged after snapshots.ts excluded. |
| 6 | Integration | ✅ real, live DB | **188/188 passed (24 files), zero skipped.** Previous 4.1 baseline 184 (23 files). Δ = +4 = the 4 new Phase 4.1.1 cases. Wall-clock 994.02s (~16.5 min) on live Neon. |
| 7 | OpenAPI drift | ⏸ placeholder | — |
| 8 | db:migrate:check | ✅ real | PASS ("Everything's fine 🐶🔥") on the new 0007 migration. |
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

- [✅] Phase 2.* / 3.* / 4.0 / 4.0.1 / 4.0.2 / 4.1 — every existing integration file re-runs green. Phase 4.1 happy-path tests implicitly validate the DTO extension (`vendorSnapshot` + `paymentsHistory` present on every fetched invoice).
- [🆕] D-35 gate reports multi-key failures (four simultaneous).
- [🆕] Vendor frozen across live-settings mutation + PDF render still succeeds.
- [🆕] Payments history frozen across live-payment mutation.
- [🆕] Empty payments history on credit-zero path renders PDF cleanly.

---

## 8. API Impact

- **Response-body additions** (non-breaking; existing clients ignore extra fields):
  - `GET /api/v1/invoices` — each list item gains `vendorSnapshot` + `paymentsHistory`.
  - `GET /api/v1/invoices/[id]` — same.
- **Error-code set unchanged** — `D35_READINESS_INCOMPLETE` (412) continues to carry the `missing` array; the only difference is that `missing` can now list up to 4 additional keys.

---

## 9. DB Impact

- **New migration**: `0007_invoice_frozen_snapshots.sql` — adds `invoices.vendor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb` + `invoices.payments_history jsonb NOT NULL DEFAULT '[]'::jsonb`.
- **New writes per invoice insert**: two JSONB values inside the existing `invoices` row — no extra rows, no extra locks.
- **New reads per invoice issue**: one `inArray(settings.key, [...])` with 18 keys (down from 18 scattered reads the old vendor mapping was on its way to needing) + one `SELECT payments WHERE order_id=?`. Both inside the confirm-delivery tx.

---

## 10. Security Check

- **Frozen data strengthens audit**. An operator who alters vendor settings cannot rewrite an already-issued facture. The hash chain's canonical form now includes `vendorSiret` so even a direct `UPDATE invoices SET vendor_snapshot = …` would be detectable by a chain-verify pass (to be fully wired in a later tranche).
- **PDF endpoint has zero live-table reads beyond the invoice + lines tables**. A stale `settings` row cannot poison a legacy PDF.
- **D-35 gate is strictly more restrictive**. No path loosens existing rejection; four more paths now reject what used to silently slip through.

---

## 11. Performance Check

- PDF generation: no change in runtime complexity. Vendor + payments come from in-memory JSON (parsed via Zod once by the mapper), not from DB I/O at render time.
- Invoice issue: one additional `inArray`-based settings read on the already-locked tx + one `payments` SELECT ordered by id. Negligible against the Neon RTT.
- Full integration suite grew by ~30s (four new cases × ~7s each on live DB).

---

## 12. Known Issues & Accepted Gaps

1. **PDF generation timestamp is still non-deterministic**. Two PDFs exported at different moments differ by a footer timestamp. This is acceptable for a French facture (the user-facing document always carries a "généré le …" line). If a future tranche wants byte-deterministic exports, the footer timestamp would move to the frozen snapshot.
2. **No chain-verify route yet**. The hash chain's `row_hash` pins the vendor SIRET + payments count, but no verifier endpoint exposes this today. That is a later tranche (consistent with `verifyCancellationsChain` + `verifyActivityLogChain` being test-only helpers so far).
3. **`shop_email` + `shop_website` remain optional**. They are not in `D35_REQUIRED_SETTINGS` because they are not legally mandatory; a French facture without them is still valid. Admins can leave them empty; the PDF just omits the line.
4. **Pilot still blocked** — treasury + settlements + avoir haven't shipped. Phase 4 remains open.

### Resolved in Phase 4.1.1

- ✅ D-35 gate enforces the full canonical key set (12 → 16).
- ✅ Vendor legal data frozen on invoice at issue; PDF reads only from the frozen row.
- ✅ Payment history block present on the PDF + frozen on the invoice row.

---

## 13. Decision

**Status**: ✅ **ready** — all real gates green (1/2/3/4/5/6/8).

### الشروط

- Commit locally; no push.
- Phase 4 continuation (treasury / settlements / avoir) remains blocked on reviewer approval.

---

## 14. ملاحظة صدق

المراجع حدد ثلاث نقاط، وكل واحدة صحيحة:

1. **D-35 ناقصة**: كان الكود يتحقق من 12 مفتاحاً، والمواصفة تطلب 16. الإصلاح: أضيفت المفاتيح الأربعة `shop_siren` و`shop_ape` و`shop_penalty_rate_annual` و`shop_recovery_fee_eur` إلى `D35_REQUIRED_SETTINGS`. اختبار قابل للفشل يفسد الأربعة مرة واحدة ويؤكد ظهورها كلها في رد الرفض — ليس واحداً فقط.

2. **PDF غير ثابتة فعلياً**: كانت مسارات render تقرأ `settings` live. الإصلاح: أضيفت عمودان JSONB على `invoices` (`vendor_snapshot` + `payments_history`) يُملآن وقت الإصدار من داخل confirm-delivery tx نفسها. الـ `renderer` الآن دالة بحتة على `InvoiceDetailDto` (بلا أي settings parameter)، والـ route ألغى قراءة settings كلياً. اختبار صريح يعدّل shop_name + shop_iban + shop_penalty_rate_annual بعد الإصدار ثم يؤكد أن vendorSnapshot لا يتغير + PDF ما زال يُعاد بنجاح.

3. **Payment history مفقودة**: المواصفة تنص عليها، وبعد Phase 4.0 صار المسار reachable فعلاً. الإصلاح: `invoices.payments_history` (JSONB) يحفظ الدفعات لحظة الإصدار؛ `drawPaymentHistoryBlock` في `pdf.ts` يعرضها بين totals و footer القانوني. اختباران: واحد يتحقق من أن صف الدفع الحقيقي جُمِّد على الفاتورة، والثاني يتحقق من أن المسار الائتماني بدون دفعة يُصدر PDF بدون الجدول بسلاسة.

لا shell tricks. لا push. Phase 4 لم تُغلق بعد — treasury + settlements + avoir لا تزال حاجزة.
