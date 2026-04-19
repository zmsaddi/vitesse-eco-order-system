# خطة التنفيذ الموحَّدة — Execution Plan

> **الحالة**: Phase 0a + 0b + **0c** مكتملة. Phase 0 (الكود) **معلَّقة لتأكيد "ابدأ"**. **78 قراراً كنسياً** (D-01..D-78). **D-77 + D-78 = Delivery Acceptance Framework كامل**: 13-gate CI، 13-section Delivery Quality Report، T+1h/T+24h monitoring، KPIs. راجع [`../audit-reports/07_developer_review_and_rebuttal.md`](../audit-reports/07_developer_review_and_rebuttal.md) لتقرير الإغلاق.
> **التاريخ**: 2026-04-19
> **المرجع الكنسي للقرارات**: [../requirements-analysis/00_DECISIONS.md](../requirements-analysis/00_DECISIONS.md)

---

## السياق

ستّ جولات مراجعة مستقلة كشفت ~178 مشكلة:
1. docs internal consistency (45 item)
2. code-vs-docs reality (6 blocker)
3. cross-file contradictions (5 blocker + 28 medium)
4. post-Phase 0a honesty review (6 فجوة صدق)
5. post-Phase 0b residual review (7 issue)
6. لجنة خبراء سبعة comprehensive review (15 blocker + 26 high + 28 medium + 12 strategic)

نتيجة تراكمية: **76 قراراً كنسياً** (D-01..D-76) في `00_DECISIONS.md`. هذه الخطة نفَّذت مواءمة الوثائق والإعدادات مع تلك القرارات عبر Phase 0a + 0b + 0c. المراجعة السابعة (تقرير #07) أغلقت 3 فجوات فاتت المراجعات الستة الداخلية.

ترقيم المراحل الموحَّد (D-13): **3 مراحل تحضيرية** (0a وثائق، 0b إعدادات، 0c مراجعة خبراء سبعة) ثم **7 مراحل تطوير برمجية** (Phase 0 حتى Phase 6).

---

## Phase 0a — مواءمة الوثائق ✅ مكتملة

### Step 1 — Wipe stale scaffold ✅

- ✅ `src/` محذوف بالكامل.
- ✅ `.github/workflows/ci.yml` محذوف.
- ✅ `.next/` محذوف.

### Step 2 — Authoritative decisions log ✅

- ✅ `docs/requirements-analysis/00_DECISIONS.md` مُنشأ بـ 25 قرار (D-01..D-25).

### Step 3 — Reconcile 37 spec files + DEVELOPMENT_PLAN.md ✅

- ✅ تعديلات targeted طُبِّقت على كل الـ 37 ملف spec + `DEVELOPMENT_PLAN.md`.
- ✅ Cron references مواءمة إلى 2 endpoints (D-23).
- ✅ status values توحَّدت بالفراغ (D-03).
- ✅ TVA storage أُزيل من schema (D-02).
- ✅ Hard-delete invariant C6 محذوف (D-04).
- ✅ Phase count موحَّد عبر كل الوثائق (D-13 الصياغة الجديدة).

### Step 4 — Grep audit ✅

`rg` command محدَّد أدناه، قابل للتكرار، مع استثناءات صريحة للملفات التي توثِّق الإزالة عمداً.

---

## Phase 0b — صدق الإعدادات ✅ مكتملة

كانت هذه المرحلة مكسورة بعد Phase 0a: الـ repo كان يدّعي أنه Next app جاهز لكنه لم يكن. أُصلِحت كل النقاط:

### Fix 1 — `package.json` ✅

- ✅ `"name": "vitesse-eco"` (كان `temp-init`).
- ✅ `"description"` أُضيف.
- ✅ `"engines": { "node": ">=24.0.0", "npm": ">=10.0.0" }`.
- ✅ `@types/node` رُفِع إلى `^24` (كان `^20`).
- ✅ Scripts أُضيفت: `typecheck`, `test`, `test:watch`, `db:generate`, `db:push`, `db:studio`.
- ✅ `ws` + `@types/ws` أُضيفا (لازمان لـ Neon WebSocket Pool — D-05).

### Fix 2 — `.nvmrc` ✅

- ✅ أُنشئ في جذر المشروع بالقيمة `24` (D-15).

### Fix 3 — `public/fonts/cairo/` ✅

- ✅ المجلد أُنشئ.
- ✅ `README.md` داخله يوثِّق العقد: Phase 0 سيُضيف `Cairo-Regular.ttf` + `Cairo-SemiBold.ttf` + `Cairo-Bold.ttf` + `OFL.txt` (D-15).

### Fix 4 — DEVELOPMENT_PLAN cron 3→2 ✅

- ✅ كل الإشارات إلى "Cron job #3" و "3 cron jobs" و "4 cron" حُذِفت.
- ✅ النص الجديد يستخدم صياغة D-23 حصراً (`/api/cron/daily` + `/api/cron/hourly`).

### Fix 5 — توحيد عدد المراحل ✅ (D-13 v3)

- ✅ **D-13 v3 canonical (Phase 0c)**: 7 مراحل برمجية (0..6) + 3 تحضيرية (0a + 0b + 0c) = **10 بنود**.
- ✅ `README.md` و `DEVELOPMENT_PLAN.md` و `00_DECISIONS.md` و هذا الملف — كلها تستخدم الصياغة الكنسية v3 **حرفياً**.
- ✅ الصيغ السابقة (v1 "6 مراحل"، v2 "7+2") محذوفة من كل مكان.

### Fix 6 — توحيد الحالة ✅

جملة واحدة موحَّدة تظهر في الثلاثة:

> "Phase 0a (مواءمة الوثائق) + Phase 0b (صدق الإعدادات) **مكتملتان**. Phase 0 (الكود — الأساس) **معلَّقة لتأكيد المستخدم 'ابدأ'**."

- ✅ `README.md` السطر 5.
- ✅ `DEVELOPMENT_PLAN.md` السطر 4.
- ✅ `00_execution_plan.md` السطر 3 (هذا الملف).

### Fix 7 — Grep audit reproducible ✅

الأمر أدناه معتمَد ومُختبَر. يستثني الملفين اللذين يذكران المصطلحات عمداً للتوثيق.

---

## Verification — الحالة الحالية

هذا Gate صلب يفصل "مكتمل" عن "مُدَّعى":

### 1. ملفات Phase 0b موجودة
```bash
test -f d:/Vitesse_eco_order_system/.nvmrc && cat d:/Vitesse_eco_order_system/.nvmrc
# متوقَّع: "24"

test -f d:/Vitesse_eco_order_system/public/fonts/cairo/README.md
# متوقَّع: موجود

grep -E '"name"|"node"|"@types/node"|"typecheck"|"test"|"db:generate"' \
  d:/Vitesse_eco_order_system/package.json
# متوقَّع: "vitesse-eco"، ">=24.0.0"، "^24"، وكل السكربتات
```

### 2. Grep audit — دقيق على مستوى "استخدام حي" مقابل "توثيق الإزالة"

المصطلحات المحذوفة (`tva_amount`, `invoice_mode`, `INV-YYYYMM`, `قيد_التحضير`, `supplier_credit`, `35 جدول`, `35 tables`) قد تظهر في الوثائق بسياقين:

- **ممنوع (usage)**: في سطر SQL DDL، أو صف جدول schema، أو قيمة seed، أو قائمة CHECK enum.
- **مسموح (removal note)**: في جملة تحتوي أحد المؤشرات: `محذوف` | `بدون` | `ليس` | `يُستبعد` | `لا مفتاح` | `يُدار في <مكان آخر>` | ذكر صريح لقرار `D-XX`.

#### الأمر الخام (first-pass filter)

```bash
cd d:/Vitesse_eco_order_system
rg --type md \
   --glob '!docs/requirements-analysis/00_DECISIONS.md' \
   --glob '!docs/implementation/00_execution_plan.md' \
   -n \
   -e 'tva_amount' \
   -e 'invoice_mode' \
   -e 'INV-YYYYMM' \
   -e 'قيد_التحضير' \
   -e 'supplier_credit' \
   -e '35 جدول' \
   -e '35 tables' \
   docs/
```

#### كيف يُفحص الناتج

لكل سطر يظهر في الخرج:

1. إذا كان ضمن سطر يحوي أحد المؤشرات (محذوف/بدون/ليس/يُستبعد/D-XX) → **مقبول**.
2. إذا لم يحو أي مؤشر → **انتهاك** يجب إصلاحه.

#### الحالة اللحظية (مُفحوصة يدوياً في 2026-04-19)

11 ظهور في الملفات التالية، كلها **مقبولة** (ملاحظات إزالة توثيقية):

| الملف | السطر | السياق |
|---|---|---|
| `02_DB_Tree.md` | 293 | "`tva_amount` **محذوف** (D-02)..." |
| `02_DB_Tree.md` | 596 | "`supplier_credit` محذوف؛ الرصيد الدائن يُدار في..." |
| `02_DB_Tree.md` | 985 | "مفتاح `invoice_mode` **محذوف** (D-09)..." |
| `06_Reference_Data.md` | 82 | "`supplier_credit` **محذوف** (D-10)..." |
| `06_Reference_Data.md` | 169 | "مفتاح `invoice_mode` **محذوف** (D-09)..." |
| `07_Workflows.md` | 177 | "`supplier_credit` ليس category في `treasury_movements`..." |
| `09_Business_Rules.md` | 162 | "لا مفتاح `invoice_mode` — هذا السلوك ثابت." |
| `12_Accounting_Rules.md` | 75 | "`supplier_credit` **محذوف** من treasury_movements (D-10)..." |
| `20_Validation_Rules.md` | 37 | "category **بدون** `supplier_credit`..." |
| `README.md` | 147 | جدول القرار D-09 |
| `README.md` | 148 | جدول القرار D-10 |

**النتيجة**: الـ grep PASSES دلالياً. كل ظهور مبرَّر. عند تعديل مستقبلي لأي ملف spec، يُعاد فحص هذه القائمة.

### 3. Grep on stale INV numbering (strict — لا ملاحظات إزالة هنا)

```bash
cd d:/Vitesse_eco_order_system
rg --type md \
   --glob '!docs/requirements-analysis/00_DECISIONS.md' \
   --glob '!docs/implementation/00_execution_plan.md' \
   'INV-YYYYMM' docs/
# متوقَّع: لا نتائج (exit code 1 = PASS)
```

### 3. Cron consistency
```bash
rg -n 'Cron job #[34]|3 cron|4 cron jobs|3 cron jobs' d:/Vitesse_eco_order_system/docs/
# متوقَّع: لا نتائج
```

### 4. Phase count consistency (D-13 v3)
```bash
# أي من الصياغات المتقادمة يجب أن يعيد 0 نتائج خارج 00_DECISIONS.md + audit-reports/:
rg -n '6 مراحل|مرحلتان تحضيريتان|9 بنود|7 \+ 2|2 تحضيريتان' \
  d:/Vitesse_eco_order_system/docs/ \
  --glob '!00_DECISIONS.md' --glob '!audit-reports/**'
# متوقَّع: لا نتائج. الصياغة المعتمدة: "7 مراحل برمجية (Phase 0..6) + 3 تحضيرية (0a + 0b + 0c) = 10 بنود".
```

### 5. حالة مترابطة
```bash
rg -n 'Phase 0a.*Phase 0b.*مكتملتان' \
  d:/Vitesse_eco_order_system/docs/DEVELOPMENT_PLAN.md \
  d:/Vitesse_eco_order_system/docs/requirements-analysis/README.md \
  d:/Vitesse_eco_order_system/docs/implementation/00_execution_plan.md
# متوقَّع: ثلاثة ملفات، كلها تحمل نفس الجملة
```

### 6. `next build` يفشل (متوقَّع)

لا `src/` = لا `app/` = `next build` يفشل. هذا **لا يُعدّ خللاً** — Phase 0 تُضيف الـ `src/`. الحالة الحالية: مشروع docs + config فقط، عمداً.

### 7. `vitest run` يفشل (متوقَّع)

لا اختبارات بعد. تُضاف في Phase 5 (tests) مع نسخ من سجل v1 الاختباري. متوقَّع.

---

## Phase 0 (Code — لا تبدأ قبل "ابدأ")

أول مرحلة برمجية. تعتمد مباشرة على الأرضية النظيفة التي أنشأتها Phase 0a + 0b.

### Pre-conditions (موجودة الآن)
- ✅ `package.json` بـ Node 24 + scripts كاملة + deps صحيحة.
- ✅ `.nvmrc`.
- ✅ `public/fonts/cairo/` مُجهَّز لاستقبال TTFs.
- ✅ 38 ملف spec خضعت لـ **7 جولات مراجعة** (6 داخلية + 1 خارجية) مع إغلاق كل blocker مُكتشَف بقرار موثَّق (D-01..D-76). الادعاء "بلا تناقضات" يُستبدَل بـ: "كل التناقضات المُكتشَفة حتى تاريخه مُعالَجة؛ الوثائق قابلة للمراجعة المستمرة".
- ✅ **76 قراراً** كنسياً (D-01..D-76) — **كلها مُطبَّقة بالكامل على specs** (D-01..D-25 في Phase 0a، D-26..D-65 في Phase 0c، D-66..D-76 من تقرير #07).
- ✅ `docs/compliance/` يحوي ملفات FR-legal: attestation éditeur، FEC delegation، registre RGPD.
- ✅ `docs/requirements-analysis/38_Accessibility_UX_Conventions.md`.
- ✅ `docs/audit-reports/` يحفظ كل الـ **7 تقارير مراجعة** (01..07) — 6 داخلية + 1 خارجية للمطوِّر.

### Steps

1. **`npm install` → `package-lock.json` يُولَّد → commit فوراً (D-70)**. قبل أي `src/`. CI لاحقاً يستخدم `npm ci` strict.
2. **`.github/workflows/ci.yml` (D-75)** — 7 gates: lint + typecheck + test + build + migration check + OpenAPI drift check + lockfile enforcement.
3. تحميل Cairo TTFs من Google Fonts والتزامها في `public/fonts/cairo/` + `OFL.txt`.
4. إنشاء `src/app/` مع `layout.tsx` (يستخدم `next/font/local`) + `page.tsx` placeholder + `globals.css`.
5. إنشاء `src/db/client.ts` مع Neon WebSocket Pool + real `withTx` (D-05 + D-26 Pool lifecycle).
6. إنشاء `src/lib/env.ts` (Zod) + `money.ts` + `tva.ts` + `ref-codes.ts` + `soft-delete.ts` + `api-errors.ts` + `can.ts` + `date.ts` + **`session-claims.ts` (D-67)** + **`password.ts` (Argon2id — D-40)**.
7. **37-جدول schema Drizzle** في `src/db/schema/*.ts` موزَّع domain-based (كل ملف ≤300 سطر). يشمل:
   - `idempotency_keys` PK (key, endpoint) — D-57
   - `suppliers.credit_due_from_supplier` — D-62
   - `order_items.commission_rule_snapshot` JSONB — D-17
   - `invoice_lines` frozen — D-30
   - `users.onboarded_at` — D-49
   - hash chain columns على invoices/activity_log/cancellations — D-37 + D-58
   - `voice_rate_limits` — D-73
8. `drizzle-kit generate` → أول migration مُلتزَم + `0001_immutable_audits.sql` (D-58 triggers) يدوي.
9. **هيكل `src/modules/<domain>/` (D-68 + D-69)** لكل domain: `schema.ts`, `dto.ts`, `mappers.ts`, `service.ts`.
10. **هيكل `src/app/api/v1/**/route.ts` (D-66)** — كل business endpoint تحت `/api/v1/`. business logic داخل `src/modules/*/service.ts`. route handlers رفيعة: parse DTO → call service → return DTO.
11. ESLint rule `max-lines: 300` على `src/**/*.ts`.
12. `next build` يمر (كأول مرة — كان يفشل بسبب Cairo من Google).
13. `npm test` يمر (اختبار واحد على `round2` + اختبار على `getSessionClaims`).
14. `tsc --noEmit` يمر.

### Exit condition (D-77 + D-78 — موحَّد لكل Phase 0..6)

**أربع حزم إلزامية لا يُتجاوَز أي منها**:

1. **13-Gate CI pack خضراء** (D-78 — يُوسِّع D-75):
   lockfile + lint + typecheck + build + unit + integration + OpenAPI drift + migration check + authz + regression pack + E2E smoke + performance smoke + a11y+logs smoke.
   - Coverage: ≥ 70% عام، **≥ 90% critical business modules**.
   - Scope-based conditional tests تُشغَّل حسب ما تغيَّر.

2. **Delivery Quality Report** بالقالب الكنسي 13-section في [`docs/phase-reports/phase-0-delivery-report.md`](../phase-reports/README.md):
   Delivery ID، Scope، Business impact، Technical impact، Risk level، Tests run (exact commands + counts)، Regression coverage، API impact، DB impact، Security check، Performance check، Known issues، Decision.
   - Evidence: screenshots للـ UI + OpenAPI diff + migration output + coverage delta + rollback note.

3. **Permanent Regression Pack** يمر كلياً (D-78 §2): login، orders، delivery، invoice، treasury، permissions، idempotency، snapshots، soft-delete، `/api/v1/*` compat، Android-readiness.

4. **Post-Deploy Monitoring Reports** (إذا كان production deploy):
   - T+1h: `phase-0-monitoring-T+1h.md`.
   - T+24h: `phase-0-monitoring-T+24h.md`.
   - Decision لكل واحد: stable / watch / rollback candidate.

**قاعدة صارمة (D-78 §9)**:
```
No delivery accepted unless:
  - 13-gate CI run passing.
  - Delivery Quality Report (13-section) submitted.
  - Post-deploy monitoring reports at T+1h and T+24h (for production).
```

أي ادعاء "Phase 0 مكتملة" بلا الحزم الأربع = غير صادق (D-77 + D-78).

---

## Phases 1..6

راجع [../DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) لتفصيل كل مرحلة مع التحليل النقدي (مخاطر، بدائل مرفوضة، deliverable). **كل Phase 1..6 تخضع لنفس Exit condition أعلاه (D-77)**.

---

## القرارات المؤجَّلة (غير blocking)

1. IBAN/BIC فعليان قبل Phase 2 settings seed.
2. فحص Node 24 LTS على Vercel Hobby وقت البناء.
3. Staging benchmark لـ Neon 190h/شهر قبل Phase 4 production.
4. أداة المحاسبة الخارجية (تؤثر على CSV export فقط).
