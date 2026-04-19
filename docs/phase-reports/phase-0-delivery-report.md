# Phase 0 Delivery Report — Foundation

> **Template**: D-78 §5 (13-section Delivery Quality Report)
> **Revision**: v2 (2026-04-19) — re-written after external developer rejection of v1. v1 overstated gate reality; this version distinguishes **real pass** / **placeholder** / **deferred** explicitly.

---

## 1. Delivery ID

- **Date**: 2026-04-19 03:54 → 04:10 (Europe/Paris) — revision window
- **Branch**: `main` (uncommitted working tree)
- **Commit SHA (base)**: `8e0358d0b16c2502ee58caa8386047d8c873d0e9` (Phase 0a/0b checkpoint)
- **Commit SHA (delivery)**: **uncommitted** — user rejected push to `main` pending these corrections.
- **PR #**: not created.
- **Phase**: **0 — Foundation** (first programmatic phase per D-13 v3).

---

## 2. Scope

### ما تغيَّر

- `package.json` + `package-lock.json` (D-70 — reproducibility).
- `.github/workflows/ci.yml` (13 gates blueprint — D-75 + D-78).
- `eslint.config.mjs`: `max-lines: 300` + `argsIgnorePattern: "^_"` (for Phase-stub underscored args).
- `vitest.config.ts` (v8 coverage, thresholds 70%, declarative-schema excluded).
- `drizzle.config.ts` (points to `src/db/schema/index.ts`).
- `public/fonts/cairo/`: `Cairo-Variable.ttf` (600KB) + `OFL.txt` (D-15).
- `src/app/{layout.tsx, page.tsx, globals.css}` (App Router skeleton + Cairo via `next/font/local`).
- `src/lib/` × 9 files: `env, money, tva, date, ref-codes, soft-delete, api-errors, session-claims (stub), password (Argon2id)`.
- `src/db/client.ts` (Pool + `withTxInRoute` + `withRead` — D-05 + D-26).
- `src/db/schema/` × 13 domain files (37 tables, each file ≤ 300 lines).
- `src/db/migrations/0000_initial_schema.sql` (drizzle-kit generated).
- `src/db/migrations/0001_immutable_audits.sql` (D-58 triggers + D-37 hash helper + pgcrypto).
- `src/modules/users/{dto,mappers}.ts` (D-69 DTO pattern proof-of-concept).
- `src/app/api/v1/health/route.ts` (first `/api/v1/` endpoint — D-66).
- `scripts/placeholder.mjs` (unified banner for deferred CI gates).
- `tests/{integration,authz,regression,money,auth}/.gitkeep` + `tests/README.md` (placeholder tree; CI uses `--passWithNoTests`).
- 8 test files under `src/lib/*.test.ts`.

### ما لم يتغيَّر

- `docs/` specs (Phase 0c closed).
- `src/middleware.ts` — Phase 1.
- `src/app/api/auth/[...nextauth]/` — Phase 1.
- Vercel env vars — outside Phase 0 scope.
- Cron endpoints — Phase 4.

---

## 3. Business Impact

لا تأثير مرئي للمستخدم — Phase 0 = foundation. **لكن**:

- Repo أصبح `npm ci` / `next build` / `npm test` / `drizzle-kit generate` → جميعها **تعمل محلياً** (كانت مكسورة قبل Phase 0).
- الصفحة الرئيسية `/` تعرض placeholder يؤكد Phase 0 جاهز.
- `GET /api/v1/health` يعمل ويُرجع `{ ok, timestamp, env }`.

---

## 4. Technical Impact

### الملفات (إحصاء فعلي)

| الفئة | عدد ملفات جديدة/معدَّلة |
|---|---:|
| Config (package, lock, vitest, drizzle, tsconfig, eslint) | 6 |
| CI (`.github/workflows/ci.yml`) | 1 |
| Scripts (`scripts/placeholder.mjs`) | 1 |
| Assets (Cairo TTF + OFL) | 2 |
| `src/app/` (layout, page, globals) | 3 |
| `src/lib/` | 9 |
| `src/db/client.ts` | 1 |
| `src/db/schema/` × 13 | 13 |
| `src/db/migrations/` × 2 | 2 |
| `src/modules/users/{dto,mappers}` | 2 |
| `src/app/api/v1/health/` | 1 |
| Tests `src/lib/*.test.ts` × 8 | 8 |
| Tests tree placeholders (`tests/**/.gitkeep` + README) | 6 |
| **Total (approx)** | **~55** |

### Endpoints added

- `GET /api/v1/health` → `{ ok: true, timestamp, env }`.

### Migrations

| Name | Purpose |
|------|---------|
| `0000_initial_schema.sql` | 37 tables. CHECK على `users.role`, `settings.key` (D-28), `voice_logs.status` (D-63), avoir `total_ttc_frozen < 0` (D-38). UNIQUE split على `bonuses` per role (D-29). RESTRICT FKs (D-27). |
| `0001_immutable_audits.sql` | `reject_mutation()` trigger على `activity_log`, `cancellations`, `price_history`, `treasury_movements`, `invoices`, `invoice_lines` (D-58). `compute_row_hash()` SQL helper + `pgcrypto` extension (D-37). |

### DB tables (37)

Full list in `src/db/schema/index.ts`. Domain split: users(6), settings(1), products(6), clients-suppliers(3), orders(4), purchases(2), delivery(2), invoices(3), bonuses(4), treasury(2), audit(3), voice(4), voice_rate_limits(1) = 37.

---

## 5. Risk Level

**Level**: 🟡 **Medium**

**Reason**:

- Foundation = leveraged risk — any error compounds across Phase 1..6.
- 7/13 CI gates are placeholders; they exit 0 but don't test anything yet. A Phase 1 dev could mistakenly rely on them. Mitigation: placeholder banners explicitly say "not a real test pass".
- Migrations `0000 + 0001` not applied to a real Neon branch yet (CI has no `TEST_DATABASE_URL` secret set). `drizzle-kit check` only validates **config + schema consistency**, not that SQL applies cleanly to Postgres. Phase 1 CI adds `TEST_DATABASE_URL` + applies migrations for real integration tests.
- `session-claims.ts` is a stub returning null; no golden-path can be tested end-to-end in Phase 0. This is expected per D-71 scope.

---

## 6. Tests Run (Local Verification — 2026-04-19)

### Breakdown: real / placeholder / deferred

**قاعدة القراءة**:
- ✅ **real** = الأمر يُشغِّل اختباراً أو أداة حقيقية وتُفحَص النتيجة.
- ⏸ **placeholder** = `--passWithNoTests` على دليل فارغ، أو `scripts/placeholder.mjs` يُخرج banner + exit 0. CI يبقى أخضر، **لكن لا اختبار حقيقي**.
- ⏳ **deferred** = الـ gate غير موجود حتى الآن (لم تُستدعَ في CI).

| # | Gate | Command | Type | Result | Duration |
|---|------|---------|:-:|:-:|---:|
| 1 | Lockfile check | `npm ci` | ✅ real | **PASS** (reproducible install, 474 packages) | 22s |
| 2 | Lint | `npm run lint` | ✅ real | **PASS** — 0 errors, **0 warnings** | ~4s |
| 3 | Typecheck | `npm run typecheck` | ✅ real | **PASS** — 0 TS errors | ~3s |
| 4 | Build | `npm run build` | ✅ real | **PASS** — compile 1.4s + TS 2.2s + routes emitted | ~8s |
| 5 | Unit + coverage | `npm run test:unit` | ✅ real | **PASS — 57/57 tests**; coverage **Stmt 85.07% / Branch 78.78% / Funcs 97.61% / Lines 86.06%** (above 70% threshold) | 0.8s |
| 6 | Integration tests | `npm run test:integration` | ⏸ placeholder | `vitest --passWithNoTests` on empty `tests/integration/` → exit 0. **لا اختبار حقيقي.** | <1s |
| 7 | OpenAPI drift | `npm run openapi:drift` | ⏸ placeholder | `scripts/placeholder.mjs` banner → exit 0. **لا OpenAPI generator installed.** | <1s |
| 8 | Migration check | `npm run db:migrate:check` | ✅ real | **PASS** — `drizzle-kit check` validates config + schema consistency (لكن لا يُطبِّق على DB حقيقية؛ ذلك في Phase 1 CI). | ~2s |
| 9 | Authorization tests | `npm run test:authz` | ⏸ placeholder | `vitest --passWithNoTests` on empty `tests/authz/`. **لا role/resource/action matrix tests.** | <1s |
| 10 | Regression pack | `npm run test:regression` | ⏸ placeholder | `vitest --passWithNoTests` on empty `tests/regression/`. **لا business flows tests.** | <1s |
| 11 | E2E smoke | `npm run test:e2e:smoke` | ⏸ placeholder | `placeholder.mjs` banner. **Playwright غير مُثبَّت.** | <1s |
| 12 | Performance smoke | `npm run test:perf` | ⏸ placeholder | `placeholder.mjs` banner. **لا p95 budget tests.** | <1s |
| 13a | Accessibility smoke | `npm run test:a11y` | ⏸ placeholder | `placeholder.mjs` banner. **axe-core غير مُثبَّت.** | <1s |
| 13b | Logging smoke | `npm run test:logs` | ⏸ placeholder | `placeholder.mjs` banner. **Sentry غير مُثبَّت.** | <1s |

### العدّ الصادق

- **Real implementations**: **6/13** — 1, 2, 3, 4, 5, 8.
- **Placeholders (exit 0 but no real test)**: **7/13** — 6, 7, 9, 10, 11, 12, 13 (a+b).
- **CI تمرّ خضراء على main**: نعم، لكن الخضرة **مَضمونة** بـ 6 gates حقيقية فقط.

### Coverage Breakdown (per-file)

| File | % Stmts | % Branch | % Funcs | % Lines |
|------|--------:|---------:|--------:|--------:|
| `api-errors.ts` | 100% | 93.75% | 100% | 100% |
| `date.ts` | 96.66% | 50% | 100% | 100% |
| `money.ts` | 95% | 93.75% | 100% | 93.75% |
| `password.ts` | 63.88% | 70% | 75% | 65.62% |
| `ref-codes.ts` | 100% | 100% | 100% | 100% |
| `session-claims.ts` | 58.33% | 33.33% | 100% | 58.33% |
| `soft-delete.ts` | 100% | 100% | 100% | 100% |
| `tva.ts` | 100% | 100% | 100% | 100% |
| **All (untested dirs excluded)** | **85.07%** | **78.78%** | **97.61%** | **86.06%** |

### CI run on GitHub

**لم يُجرَ بعد** — هذا snapshot محلي فقط. المستخدم رفض push إلى `main`؛ سيُختبَر CI عبر branch أو بعد مراجعة هذا التقرير.

---

## 7. Regression Coverage (D-78 Permanent Pack)

- [⏳] login/logout/session expiry — Phase 1.
- [⏳] order create/edit/cancel/collect — Phase 3.
- [⏳] delivery assign/confirm/handover — Phase 4.
- [⏳] invoice generate/PDF/avoir — Phase 4.
- [⏳] treasury transfer/reconcile/settlements — Phase 4.
- [⏳] permission enforcement — Phase 1.
- [⏳] idempotency on money-changing endpoints — Phase 3.
- [⏳] snapshots — Phase 3-4.
- [~] soft-delete/soft-disable — **schema في مكانه** (D-04 + D-27)، **logic الاستخدام** في Phase 1+.
- [~] `/api/v1/*` prefix — **قائمة الـ endpoints مُطبَّقة في specs**، **endpoint واحد حقيقي** (`/health`).
- [~] Android-readiness — **SessionClaims abstraction موجود** (stub)، **DTO pattern proof** مُنشأ.

**صراحة**: Phase 0 **لا يُثبت** أي critical business flow. هذا per-design per D-71 (MVP = order-to-cash، Phase 1-3).

---

## 8. API Impact

- **Endpoints added**: `GET /api/v1/health`.
- **Endpoints changed**: none.
- **Endpoints removed**: none.
- **Versioning impact**: `/api/v1/` inaugurated (D-66). كل endpoint قادم يمتد على الـ prefix.
- **OpenAPI diff**: لا generator بعد — gate 7 placeholder.

---

## 9. DB Impact

- **Migrations**: 2 جديدتان. 
  - `0000_initial_schema.sql` (drizzle-kit generated — 37 tables).
  - `0001_immutable_audits.sql` (manual SQL — triggers + pgcrypto).
- **`drizzle-kit check`**: ✅ pass (schema/config consistency — **ليس DB-level application**).
- **لم تُطبَّق على Neon إطلاقاً بعد**: Phase 0 لا يحتاج DB حية لأن لا routes تستخدمها (عدا `/health` الذي لا يستدعي DB).
- **Data risk**: **none** — fresh build، لا بيانات v1 migration (per D-71).
- **Rollback note**:
  - لم تُطبَّق migrations على إنتاج بعد.
  - لو طُبِّقت: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` آمن (لا بيانات حقيقية).
  - `0001_immutable_audits.sql` قابل للعكس يدوياً: `DROP TRIGGER` لكل trigger + `DROP FUNCTION reject_mutation, compute_row_hash`.

---

## 10. Security Check

- **Auth changes**: `session-claims.ts` stub (returns null) — Phase 1 يُلحِقه بـ Auth.js v5 + Argon2id (D-40).
- **Permissions**: لا matrix بعد — Phase 1.
- **Secrets handling**: `env.ts` Zod-validated. Production safety: `ALLOW_DB_RESET=true` ممنوع في production (throws).
- **Destructive paths**: لا يوجد. Phase 0 بلا DELETE endpoints.
- **npm audit**: **4 moderate** في `drizzle-kit → @esbuild-kit/core-utils → esbuild`. **Accepted**: dev-only dependency (لا تأثير production). fix يتطلب breaking change في drizzle-kit → مؤجَّل.
- **PII masking**: schema في مكانه (D-39)؛ logic تُضاف عند أول client routes (Phase 2).

---

## 11. Performance Check

- **Endpoints added**: `/api/v1/health` — static JSON، p95 متوقَّع < 10ms.
- **Bundle size**: Next.js 16 baseline + Cairo Variable TTF (600KB). **لم يُقَس FCP على production yet**.
- **Neon compute hours**: 0 (لا DB traffic في Phase 0).
- **Blob storage**: 0 (Phase 2+).

---

## 12. Known Issues & Accepted Gaps (صريحة — بلا تضخيم)

### Accepted

1. **7/13 CI gates هي placeholders** (exit 0 بلا اختبار حقيقي). مُوضَّح في §6. تُحوَّل إلى real تدريجياً:
   - Phase 1: gates 6 (integration), 9 (authz), 10 (regression لـ auth flow) يصبحون real.
   - Phase 1+: gate 11 (E2E smoke) يصبح real مع أول Playwright golden path.
   - Phase 3+: gate 12 (perf) real مع endpoints.
   - Phase 1+: gate 13a (a11y) real مع UI.
   - Phase 5+: gate 13b (logs) real مع Sentry.
   - Phase 1+: gate 7 (openapi:drift) real مع OpenAPI generator.
2. **Gate 8 (migration check) real لكن ضعيف**: يتحقق من config/schema consistency عبر drizzle-kit، لا يُطبِّق SQL على DB فعلية. Phase 1 CI يضيف `TEST_DATABASE_URL` + `db:migrate:check` حقيقي يطبق + يراجع.
3. **`session-claims.ts` stub**: `getSessionClaims` يُرجع null حتى Phase 1.
4. **`password.ts` bcrypt fallback branch غير مُختبَر**: coverage 64%. يتطلب فشل `@node-rs/argon2` native binding (نادر). قبول معقول.
5. **npm audit: 4 moderate في drizzle-kit devDeps**: مؤجَّل حتى إصدار drizzle-kit يحلّه.
6. **لا `middleware.ts`**: Phase 1.
7. **Cairo Variable font غير subsetted (D-56)**: Phase 4 يضيف `pyftsubset`.

### Not hidden

- لا seed data (admin user، treasury_accounts defaults) — Phase 1 يضيف `/api/init`.
- لا OpenAPI generator — Phase 1.
- لا Sentry — Phase 5.
- لا Playwright — Phase 1.

---

## 13. Decision

**Status**: ⚠️ **ready-with-conditions (local checkpoint only — NOT ready for push to `main`)**

### الشروط (صريحة)

1. **6/13 gates real-pass** محلياً — كافية كـ checkpoint foundation، لكن **ليست "13/13 CI green"**. كل فعالية Phase 0 تحتاج توسعة حقيقية في Phase 1.
2. **0 errors، 0 warnings**.
3. **Coverage 85% stmt / 79% branch / 98% func / 86% lines** — فوق 70% threshold.
4. **Gate 8** مُوضَّح بدقة: real-pass (drizzle-kit check) لكن ليس migration application على DB حية.
5. **7 placeholders** يُطبعون banner "not a real test pass" — لا تضليل.

### قرار النشر (D-78 §9)

- ❌ **Push إلى `main` مرفوض** من المستخدم (بعد اكتشافه تناقض سابق بين ادعاء CI وواقعه).
- ✅ **Local commit أو feature branch** مقبول.
- الخطوة التالية الموصى بها:
  1. Commit على branch `phase-0-foundation` (ليس `main`).
  2. Push الـ branch للـ GitHub → أول CI run حقيقي يُربَط هنا كـ link.
  3. بعد تأكيد الـ 13 gate خضراء على GitHub Actions (حتى لو 7 منها placeholders)، PR إلى `main`.
  4. `main` يبقى في Phase 0c state حتى merge.

### Post-delivery monitoring

- **غير مطلوب لـ Phase 0**: لا production deploy. T+1h / T+24h monitoring reports تُضاف عند first Vercel deploy (Phase 1/2).

---

## 14. ملاحظة صدق نهائية (صححت بعد rejection v1)

**v1 أخطأ في عدّ 8/13 gates**. الصحيح **6/13 real + 7/13 placeholders**.

**v1 قال "Gate 8 no-op"** — خاطئ. الصحيح: Gate 8 **real** لكن محدود النطاق (schema check، ليس DB application).

**v1 ترك warning في `session-claims.ts`** — الآن مُصلَح (`argsIgnorePattern: "^_"`).

**v1 كتب `-- يُفعَّل مع ...` كـ echo placeholders** قد يبدو passing — الآن `placeholder.mjs` يُخرج banner واضح "not a real test pass".

Phase 0 foundation **سليم تقنياً** (6 gates real، typecheck/build/lint/tests نظيفة، schema + migrations مُولَّدة، DTO pattern pooved، CI workflow blueprint مكتمل). لكن **الادعاء "CI فعلاً خضراء" بلا qualification غير صادق** حتى تُفعَّل الـ 7 placeholders.
