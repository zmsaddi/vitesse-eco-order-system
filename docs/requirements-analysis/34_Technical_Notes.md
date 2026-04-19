# ملاحظات تقنية — Technical Notes

> **رقم العنصر**: #34 | **المحور**: ح | **الحالة**: مواصفات نهائية

---

## البنية التحتية

- **الاستضافة**: Vercel Hobby/Free. التصميم لا يعتمد على ميزات Pro الحرجة.
- **قاعدة البيانات**: Neon Postgres Free — حجم متوقع < 500 MB للسنة الأولى.
- **التخزين**: Vercel Blob لصور المنتجات (500 MB) مع `sku_limit=500 × 3 صور × 300 KB` (D-25).
- **Whisper + LLM**: Groq API (مستوى مجاني سخي لـ `whisper-large-v3` + `llama-3.1-8b-instant`).
- **Cron**: **2 endpoints فقط** على Hobby (D-23) — `/api/cron/daily` + `/api/cron/hourly`.

---

## Stack التقني

| الطبقة | التقنية | ملاحظات |
|--------|---------|---------|
| Framework | Next.js 16 + TypeScript strict (App Router) | |
| Runtime | **Node.js 24 LTS** (D-15) | `.nvmrc=24`، `engines.node: ">=24"` |
| CSS | Tailwind CSS v4 + shadcn/ui | RTL-first |
| Fonts | Cairo عبر `next/font/local` (D-15) | TTF في `public/fonts/cairo/`، self-contained build |
| ORM | Drizzle ORM | |
| DB Driver | `@neondatabase/serverless` | **WebSocket Pool للكتابات** (D-05)، HTTP للقراءات |
| Validation | Zod v4 (مشترك frontend + backend) | |
| Data Fetching | TanStack Query | polling 90s/180s (D-42 — raised من 60s) |
| State | Zustand (إشعارات + تفضيلات) | |
| Real-time | **Polling فقط** (D-14 + D-41) — SSE محذوف. Notifications on-demand + DataTables 90s/180s adaptive. | |
| Auth | Auth.js v5 + **Argon2id** (D-40) — fallback bcrypt 14 rounds | |
| Charts | Recharts | |
| Voice | Groq (Whisper + Llama 3.1 8B Instant) | |
| Testing | Vitest + Neon ephemeral branch per CI job | |

## قيود الاستضافة المجانية

- **Vercel Hobby**: 100 GB bandwidth، function timeout 300s (افتراضي 2026+)، **2 cron max**، 64 env vars.
- **Neon Free**: 0.5 GB storage، 190 compute hours/شهر، PITR 7 أيام.
- **Vercel Blob**: 500 MB → `sku_limit=500` مع compression.
- **لا Redis**: rate limiting في **جدول Neon `voice_rate_limits`** (D-14 — ليس in-memory Map).

## مبادئ الكود

1. **لا ملف يتجاوز 300 سطر** — ESLint `max-lines: 300` على `src/**/*.ts`.
2. **TypeScript strict** في كل مكان — لا `any`.
3. **الأرقام المالية**: `NUMERIC(19,2)` → Drizzle يعيدها string → `parseFloat()` + `round2()`.
4. **التواريخ**: `DATE` / `TIMESTAMPTZ` (ليس TEXT) — قرار M4.
5. **المنطقة الزمنية**: Europe/Paris لكل الحسابات الزمنية — قرار L3.
6. **round2()**: `Math.round((x + Number.EPSILON) * 100) / 100`.
7. **كل الأرقام TTC** — TVA محسوبة فقط عند render الفاتورة، لا تُخزَّن (D-02).
8. **Transactions**: كل mutation مالي عبر `withTx()` حقيقي (D-05).
9. **Soft-delete مطلق**: لا DELETE endpoint على الجداول المالية (D-04).
10. **Idempotency**: `Idempotency-Key` header على mutations الحرجة (D-16).
11. **FK IDs**: مصدر truth + `*_name_cached` للعرض التاريخي (D-20).
12. **API versioning (D-66)**: كل Business API يبدأ بـ `/api/v1/*` من Phase 0 Step 1. الـ prefix إلزامي للـ routes التشغيلية/المالية/التقارير (راجع 35_API_Endpoints.md § السياسات الحاكمة). خارج الـ versioning: `/api/auth/*`, `/api/cron/*`, `/api/health`, `/api/init`, `/api/backup/*`.
13. **Route handlers = canonical business interface (D-68)**: `src/app/api/v1/**/route.ts` هي الواجهة الوحيدة لمنطق الأعمال. Server Actions مسموحة **فقط** كـ thin adapters للـ web UI تستدعي route handler عبر fetch — لا business logic ولا DB access مباشر داخلها.
14. **SessionClaims abstraction (D-67)**: كل route handler يستدعي `getSessionClaims(request)` من `src/lib/session-claims.ts`، **ليس `auth()` مباشرة**. يفتح دمج Android bearer token لاحقاً بدون retrofit.
15. **DTO layer (D-69)**: كل domain module يُعرِّف DTO منفصل عن Drizzle schema في `src/modules/<domain>/dto.ts`. route handlers تُرجع DTOs، ليس Drizzle rows. mappers في `src/modules/<domain>/mappers.ts`.

## هيكل المشروع (بعد تطبيق D-66 + D-68 + D-69)

```
src/
  app/
    (auth)/login/
    (admin)/...
    api/
      auth/[...nextauth]/            ← خارج versioning (D-66)
      cron/{daily,hourly,weekly}/    ← internal scheduler، خارج versioning
      health/                        ← probe، خارج versioning
      init/, backup/                 ← dev/admin، خارج versioning
      v1/                            ← **Business APIs (D-66)**
        orders/, purchases/, invoices/, payments/, ...
        clients/, suppliers/, products/, ...
        treasury/, settlements/, distributions/, bonuses/, ...
        notifications/, activity/, voice/, lookups/, me/
    orders/, deliveries/, ... (UI pages)
  components/
    ui/         (shadcn primitives)
    layout/     (Sidebar, Topbar, AppLayout)
    data-table/ (DataTable, DataCardList, FilterBar, Pagination)
    forms/      (FormCard, SmartSelect, ImageUpload)
    dialogs/    (ConfirmDialog, DetailDialog, CancelDialog)
    voice/      (VoiceButton, VoiceConfirm)
  db/
    client.ts         (Pool + withTx — D-05)
    schema/           (37 جدول موزَّع domain-based — D-73 أضاف voice_rate_limits)
    migrations/       (drizzle-kit generated)
  lib/
    env.ts              (Zod-validated env)
    money.ts, tva.ts, ref-codes.ts, soft-delete.ts
    api-auth.ts, api-errors.ts, can.ts, date.ts
    session-claims.ts   ← D-67: `getSessionClaims(request)` — abstraction للـ web/mobile auth
  middleware.ts         ← D-59: JWT role-only، لا DB
  modules/              ← business logic per domain (D-68 + D-69)
    orders/
      schema.ts         ← Drizzle DB shape
      dto.ts            ← D-69: DTOs للـ API (Zod schemas)
      mappers.ts        ← D-69: dbRowToDto() + dtoToDbInsert()
      service.ts        ← business logic، يأخذ DTO ويُرجع DTO
      queries.ts, helpers.ts
    voice/
      rate-limit.ts     ← D-73: DB-only via voice_rate_limits
      prompt.ts, normalizer.ts, resolver.ts, blacklist.ts
      entity-cache.ts   ← D-34: module-level Map TTL 60s
    ...
  stores/               (Zustand — drafts + UI state فقط، ليس server state)
  providers/            (QueryProvider, AuthProvider)
  types/

public/
  fonts/cairo/        (Cairo TTF files — D-15)
  stamp.png           (رسوم ختم الفاتورة)
```

## متغيرات البيئة

```
NODE_ENV=production|development|test

# Database (D-05)
DATABASE_URL=postgresql://...?sslmode=require        (pooled, للكتابات)
DATABASE_URL_UNPOOLED=postgresql://...?sslmode=require (direct، للـ migrations)

# Auth.js v5
AUTH_SECRET=<32+ chars>
AUTH_URL=https://vitesse-eco.fr

# Voice
GROQ_API_KEY=gsk_xxx

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx

# Cron
CRON_SECRET=<random>

# Dev-only destructive
ALLOW_DB_RESET=true|false   (prod: false)
```
**ملاحظة (D-41)**: `FEATURE_SSE` محذوف كلياً — لا flag real-time.

---

## Support Matrix (D-74 — Post-Round-7)

### Tier 1 — Must work (E2E tests إلزامية)

| Browser | Version | Platform | Target role |
|---------|---------|----------|-------------|
| Chrome | 120+ | Windows 10/11 desktop | all admin roles |
| Chrome | 120+ | macOS 13+ desktop | all admin roles |
| Edge | 120+ | Windows 10/11 desktop | all admin roles |
| Chrome | 120+ | Android 12+ | driver, seller (mobile) |

**معايير القبول**: zero bugs في golden paths (login → create order → confirm delivery → generate invoice).

### Tier 2 — Should work (smoke tests فقط)

| Browser | Version | Platform |
|---------|---------|----------|
| Safari | 17+ | macOS 14+ desktop |
| Safari | 17+ | iOS 17+ |
| Firefox | 120+ | Windows/macOS desktop |

**معايير القبول**: degraded UX مقبول (font fallback, missing CSS feature)، لا crashes، login يعمل، create order ينجح.

### Tier 3 — Out of scope

- IE 11 / Edge Legacy — غير مدعوم.
- Samsung Internet — قد يعمل، لا يُضمَن، لا تُكتَب اختبارات له.
- Chrome < 120 / Safari < 17 — غير مدعوم.
- Android 10 — مقبول best-effort، لا CI coverage.

### Responsive breakpoints

| Breakpoint | Range | Target device |
|------------|-------|---------------|
| Mobile | 320-767px | driver + seller phone |
| Tablet | 768-1023px | manager tablet (rare) |
| Desktop | 1024px+ | PM/GM + data entry |

### Testing strategy (ربط بـ D-75)

- **CI matrix**: Chrome 120 headless + Playwright على golden paths.
- **Manual smoke**: Edge 120 + Chrome Android (monthly على staging).
- **Tier 2**: manual smoke ربع سنوي فقط.

### مراجعة دورية

مصفوفة الدعم تُراجَع **كل 6 أشهر**. Browser version minimums ترتفع مع marketshare reports.

---

## CI Gates (D-75 مُوسَّع بواسطة D-78 — 13 Gate)

`.github/workflows/ci.yml` يُنشأ في **Phase 0 Step 2** (قبل أي feature code). يحتوي **13 gate، كلها blocking**. المواصفة الكاملة في [D-78](../requirements-analysis/00_DECISIONS.md#d-78-delivery-acceptance-framework-13-gate-pack-13-section-report-post-deploy-monitoring-kpis).

```yaml
# .github/workflows/ci.yml (blueprint — يُنشأ في Phase 0 Step 2)
name: CI
on:
  push: { branches: [main] }
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: 'npm' }

      # Gate 1: lockfile enforcement (D-70)
      - run: npm ci

      # Gate 2: ESLint (max-lines: 300 + no-unused-vars + type-aware rules)
      - run: npm run lint

      # Gate 3: TypeScript strict
      - run: npm run typecheck        # tsc --noEmit

      # Gate 4: Next.js build
      - run: npm run build            # يكشف route errors قبل deploy

      # Gate 5: Unit tests + coverage enforcement
      - run: npm run test:unit        # Vitest + coverage thresholds (70% general, 90% critical)

      # Gate 6: Integration tests (Neon ephemeral branch)
      - run: npm run test:integration # API + DB against test branch

      # Gate 7: OpenAPI drift check (D-66)
      - run: npm run openapi:drift    # generated vs route handlers

      # Gate 8: Migration check (up + down + empty DB)
      - run: npm run db:migrate:check

      # Gate 9: Authorization matrix tests
      - run: npm run test:authz       # 6 roles × resources × actions → expected allow/deny

      # Gate 10: Regression pack (permanent critical flows)
      - run: npm run test:regression  # login/order/delivery/invoice/treasury/permissions/idempotency/snapshot/soft-delete/v1-compat/android-ready

      # Gate 11: E2E smoke (Playwright Chrome 120)
      - run: npm run test:e2e:smoke   # golden paths per D-74 support matrix

      # Gate 12: Performance smoke
      - run: npm run test:perf        # p95 per endpoint within budget

      # Gate 13: Accessibility + logging smoke
      - run: npm run test:a11y        # axe-core على golden paths
      - run: npm run test:logs        # endpoints تنتج logs/metrics المتوقَّعة
```

### معايير القبول (D-78 — صفر tolerance)

- ✅ كل PR على `main` يجب أن يمر بالـ 13 gate (كلها blocking).
- ✅ branch protection على `main` = لا merge قبل نجاح CI.
- ✅ **Coverage thresholds**:
  - Critical business modules (`orders/service`, `invoices/service`, `treasury/service`, `bonuses/service`, `distributions/service`): **branch coverage ≥ 90%**.
  - General modules: coverage ≥ **70%**.
- ✅ `main` فقط يُنشر على production.
- ✅ كل production deploy يتبعه **monitoring reports** عند T+1h و T+24h (D-78).

### Scope-Based Conditional Tests (D-78)

إضافة للـ 13 gate، حسب ما تغيَّر:

| إذا تغيَّر | اختبار إضافي |
|-----------|----------------|
| auth (`session-claims.ts`) | `npm run test:auth:full` |
| API schema | `npm run openapi:diff` (backward compat) |
| DB schema | `npm run db:migrate:round-trip` (up → down → up) |
| money logic | `npm run test:money:edge` (rounding + negatives + concurrency) |
| UI | `npm run test:responsive` + `npm run test:keyboard` |
| perf-sensitive | `npm run test:perf:compare-baseline` |
| voice | `npm run test:voice:accuracy` (sample set) |

### Exceptions

- Phase 0a + 0b + 0c الحاليات: لا CI (لا src/). CI يُفعَّل في **Phase 0 Step 2**.
- Phase 0 Step 1-5: بعض gates قد تعود no-op حتى وجود src (e.g. `test:regression` قبل وجود flows). يُفعَّل تدريجياً مع إضافة الميزات.

### Secrets للـ CI

Neon ephemeral branch per CI job:
- `NEON_API_KEY` — لإنشاء branch.
- `DATABASE_URL` — يُحقن من branch الـ CI.
- حذف الـ branch عند نهاية الـ job.

**السبب (D-75 + D-78)**: بدون CI شامل، `build` / `test` / `lint` يظلون ادعاءات غير مُتحقَّقة. تقرير المطوِّر #07 صنَّف غياب CI كخطر حاد. Delivery بلا 13-gate pack + Delivery Quality Report = **مرفوض** (D-78 enforcement policy).

---
