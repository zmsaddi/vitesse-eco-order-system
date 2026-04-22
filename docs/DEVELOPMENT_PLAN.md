# خطة التطوير — Development Plan

> **آخر تحديث**: 2026-04-22
> **الحالة**: Phase 0..3 **مغلقة** (Phase 3 closing baseline = `0151b0f`). **Phase 4 مغلقة محليًا** على baseline `fba93e4` (Phase 4.0/4.0.1/4.0.2 + 4.1/4.1.1/4.1.2 + 4.2/4.2.1 + 4.3/4.3.1/4.3.2 + 4.4/4.4.1 + 4.5 كلها committed؛ الـ Closure Pack docs-only في هذه الـ commit). **82 قراراً** (D-01..D-82). **D-77 + D-78 = Delivery Acceptance Framework**: 13-gate CI، 13-section report، T+1h/T+24h monitoring، KPIs (zero tolerance). الإقفال ليس إذناً بنشر إنتاجي — Phase 4 شرط ضروري لـ pilot تشغيلي كامل.
> **النوع**: مشروع جديد بالكامل (fresh build)
> **المواصفات**: [requirements-analysis/](requirements-analysis/)
> **القرارات الحاكمة**: [requirements-analysis/00_DECISIONS.md](requirements-analysis/00_DECISIONS.md) — **82 قراراً** فاصلاً (D-01..D-82)
> **خطة التنفيذ**: [implementation/00_execution_plan.md](implementation/00_execution_plan.md)

---

## الملخص التنفيذي

v2 هو نظام إدارة عمليات كامل لشركة **Vitesse Eco SAS** (بيع مركبات إيكولوجية في فرنسا). يدعم 6 أدوار، طلبات متعددة الأصناف، صناديق مالية هرمية، كتالوج بصور، إشعارات بالـ polling، وإدخال صوتي بالعربية عبر Groq.

المشروع يُبنى من الصفر بـ Next.js 16 + TypeScript strict + Drizzle + Zod على Vercel Hobby/Free + Neon Free. الترقيم حسب قرار D-13 (v3): **3 مراحل تحضيرية** (Phase 0a: مواءمة الوثائق، Phase 0b: صدق الإعدادات، Phase 0c: 6 مراجعات داخلية + 1 مراجعة خارجية للمطوِّر) — **الثلاث مُطبَّقة بالكامل** (D-01..D-76 كلها على specs) — ثم **7 مراحل تطوير برمجية**: Phase 0 (الأساس) + Phases 1..6 (الميزات). معدَّل تسليم متوقَّع ~2 أسابيع لكل مرحلة برمجية.

---

## القرارات المعمارية المعتمدة

| # | القرار | المبرر |
|---|--------|--------|
| 1 | **Next.js 16 App Router** | الحد الأدنى من المكدس. **Business APIs = route handlers (D-68 + D-66)** في `/api/v1/*`. Server Actions مسموحة **فقط** كـ thin adapters للـ web UI تستدعي route handler عبر fetch — لا business logic ولا DB access فيها. هذا يضمن استهلاك نفس الـ API من Android لاحقاً بدون تكرار. |
| 2 | **Drizzle ORM + Neon WebSocket Pool للكتابات** | معاملات حقيقية (`drizzle-orm/neon-serverless`). Neon HTTP driver للقراءات فقط (لا يدعم transactions). |
| 3 | **Zod في كل مكان** | مخطَّط واحد يغطي: env validation + API input + form validation + OpenAPI generation. |
| 4 | **Auth.js v5 + Argon2id** | JWT sessions، CredentialsProvider، DB-driven role. Argon2id hashing (D-40) — fallback bcrypt 14. Session idle 30m + absolute 8h (D-45). |
| 5 | **Soft-delete مطلق — لا hard delete** | كل جدول حركي/مالي يحمل `deleted_at`. DELETE ممنوع حتى لـ PM (D-04). كل FK = RESTRICT (D-27). |
| 6 | **Polling فقط — لا SSE (D-41)** | Notifications on-demand عند فتح Bell + `X-Unread-Count` header (D-42). DataTables 90s adaptive → 180s بعد 3 دقائق idle (D-42). |
| 7 | **تقسيم domain-based لـ `src/modules/<domain>/`** | كل ملف ≤ 300 سطر. ESLint `max-lines: 300`. |
| 8 | **المنطق التجاري محفوظ بـ Vitest specs من اليوم الأول** | كل قاعدة تجارية → اختبار قبل الاستخدام في UI. |
| 9 | **Permissions DB-driven** | جدول `permissions` + `can()` helper — لا hardcoding في middleware. |
| 10 | **TTC في كل مكان، TVA غير مخزَّنة** | المبالغ TTC فقط. TVA محسوبة عند render الفاتورة من `settings.vat_rate`. المحاسبة الخارجية تتولى تقارير الضريبة (D-02). |
| 11 | **Idempotency صارم** | جدول `idempotency_keys` (D-16) — كل mutation حرج يقبل `Idempotency-Key` header بـ TTL 24h. |
| 12 | **FK IDs + name caching** | `*_id` FK هو مصدر truth، `*_name_cached` للعرض التاريخي (D-20). |
| 13 | **Self-contained build** | Cairo عبر `next/font/local` — لا اعتماد على الإنترنت وقت البناء (D-15). |

---

## Stack التقني النهائي

| الطبقة | التقنية | الإصدار | السبب |
|--------|---------|---------|-------|
| Framework | Next.js | 16.x (App Router) | Server Components + Route Handlers (business APIs — D-68) + Middleware. Server Actions = thin adapters اختيارية فقط للـ web forms (D-68 + D-66). |
| Runtime | Node.js | **24 LTS** (D-15، `.nvmrc=24`) | Vercel default |
| Fonts | Cairo | **local** (D-15، TTF في `public/fonts/cairo/`) | self-contained build |
| Language | TypeScript | 5.x (strict) | سلامة النوع |
| CSS | Tailwind CSS | v4 | JIT + RTL |
| UI | shadcn/ui | latest | قابلة للتحكم + accessible |
| ORM | Drizzle | latest | type-safe + migrations |
| DB Driver | @neondatabase/serverless | latest | WebSocket Pool (writes) + HTTP (reads) |
| Validation | Zod | v4 | env + API + forms |
| Data Fetching | TanStack Query | v5 | cache + polling + invalidation |
| State | Zustand | v5 | notifications + preferences |
| Auth | Auth.js | v5 | JWT + role |
| Password | bcryptjs | 3.x | — |
| Charts | Recharts | v3 | dashboards |
| Voice STT | Groq Whisper | large-v3 | — |
| Voice NLP | Groq Llama | 3.1-8b-instant | 5× أسرع من 70B، جودة كافية |
| Images | Vercel Blob | — | تكامل مدمج |
| Testing | Vitest | v4 | + ephemeral Neon branches |
| Deploy | Vercel | Hobby/Free | — |
| DB | Neon Postgres | 17+ | Free tier كافٍ |

---

## نطاق MVP (D-71 — Post-Round-7)

**MVP v1 / أول Production Deploy (Phases 0..4) = Order-to-Cash → Treasury handover**:

> **ملاحظة توافق (Step 0.1 hotfix — 2026-04-21)**: كان هذا السطر يقرأ سابقاً "Phases 0..3 = Order-to-Cash فقط"، بينما قائمة البنود تضم صراحةً عناصر من Phase 4 (delivery + invoice + treasury handover). الصياغة الجديدة تتَّسق مع [Phase 4 Closure Criteria](#phase-4---التوصيل--الصناديق--الفواتير--العمولات--التسويات--xxl-12-16-يوم) ومع L16 "Production launch بعد Phase 4".

**مُدرج في MVP** (هدف أول production deploy):
1. Auth + 6 roles + DB-driven permissions (Phase 1).
2. Clients + Products + Suppliers CRUD minimal (Phase 2).
3. Orders multi-item + Cancellation C1 **simple mode فقط للـ operational roles** (Phase 3).
4. Preparation board للـ stock_keeper (Phase 3).
5. Purchases weighted-avg + reverse + expenses (Phase 3).
6. Delivery + confirmation + collection للـ driver (Phase 4).
7. Invoice frozen snapshot + PDF (Phase 4).
8. Treasury handover driver → manager → GM (Phase 4).
9. Role home = Action Hub لـ PM/GM/manager (D-72)، task-first للـ operational (غير مغيَّر).
10. Basic notifications (in-app، on-demand — D-42).

**مؤجَّل إلى post-MVP (Phases 5..6)**:
- Voice input → Phase 5 مع re-evaluation أولاً (الاستمرار غير مضمون).
- **Dashboards الثقيلة (charts + widgets) → Phase 5** (reviewer decision 2026-04-21 — ليست blocker لإغلاق Phase 4).
- Permissions UI interactive → Phase 6.
- **Profit Distributions (`/api/v1/distributions` + UI) → Phase 6** (reviewer decision 2026-04-21 — expert-comptable يتولاها حالياً؛ ليست blocker لإغلاق Phase 4).
- **Activity log explorer UI → Phase 5** (reviewer decision 2026-04-21 — الـDB موجود من Phase 3؛ الـUI ليس blocker لإغلاق Phase 4).
- Command Palette (Ctrl+K) → Phase 6 polish.
- Onboarding modal المطوَّل (D-49) → يُخفَّف إلى tooltip واحد لكل دور في MVP.
- Cancel advanced mode للـ seller → admin فقط في MVP.
- **Reports dashboard + charts → Phase 5** (reviewer decision 2026-04-21 — ليست blocker لإغلاق Phase 4).
- **Notifications expansion (email/SMS channels)** → Phase 5.

**السبب**: تقييم المطوِّر الخارجي (تقرير #07 — 64/100) كشف أن النطاق السابق (7 مراحل كاملة) واسع جداً. MVP ضيق = إطلاق أسرع + تعلُّم حقيقي قبل التوسع.

---

## Phase Exit Criteria الموحَّد (D-77 + D-78 — CRITICAL)

**لا تُعلَن أي مرحلة (Phase 0..6) "مكتملة" قبل استيفاء كل البنود التالية**. المواصفة الكاملة في [D-78](requirements-analysis/00_DECISIONS.md#d-78-delivery-acceptance-framework-13-gate-pack-13-section-report-post-deploy-monitoring-kpis).

### 1. Mandatory Test Pack — 13 Gate (D-78)

الـ CI يُشغِّل **13 gate، كلها blocking**:

| # | Gate | Pass condition |
|---|------|----------------|
| 1 | Lockfile check | `package-lock.json` مُحدَّث إذا deps تغيَّرت |
| 2 | Lint | 0 errors |
| 3 | Typecheck | 0 TypeScript errors |
| 4 | Build | production build ينجح |
| 5 | Unit tests + coverage | all pass، **≥ 70% عام، ≥ 90% critical** |
| 6 | Integration tests | all pass على test DB (Neon ephemeral branch) |
| 7 | API contract check | 0 undocumented OpenAPI drift |
| 8 | Migration check | up + down + empty DB verified |
| 9 | Authorization tests | 6 roles × resources × actions matrix |
| 10 | Regression pack | كل المسارات الحرجة الدائمة pass (راجع أدناه) |
| 11 | E2E smoke | golden paths على Chrome 120 (D-74) |
| 12 | Performance smoke | p95 ضمن budget |
| 13 | Accessibility + logging smoke | 0 new a11y issues + logs/metrics متوقَّعة |

**Permanent Regression Pack** (gate 10): login، orders (create/edit/cancel/collect)، delivery (assign/confirm/handover)، invoice (generate/PDF/avoir)، treasury (transfer/reconcile/settlements)، permissions enforcement، idempotency، snapshots، soft-delete، `/api/v1/*` backward compat، Android-readiness.

### 2. Delivery Quality Report — 13 Section (D-78)

يُحفَظ في `docs/phase-reports/phase-{N}-delivery-report.md` بالقالب الكنسي من [D-78 §5](requirements-analysis/00_DECISIONS.md) و [phase-reports/README.md](phase-reports/README.md):
1. Delivery ID — 2. Scope — 3. Business impact — 4. Technical impact — 5. Risk level — 6. Tests run (exact commands + counts) — 7. Regression coverage — 8. API impact — 9. DB impact — 10. Security check — 11. Performance check — 12. Known issues — 13. Decision.

**Evidence requirements** (D-78 §8): screenshots للـ UI changes، OpenAPI diff output، migration result، coverage delta، rollback note، known-risk note.

### 3. Post-Delivery Monitoring Reports — T+1h و T+24h (إلزامي للـ production deploys)

بعد كل production deploy، ملفان:
- `docs/phase-reports/phase-{N}-monitoring-T+1h.md` (فحص سريع).
- `docs/phase-reports/phase-{N}-monitoring-T+24h.md` (تأكيد استقرار يوم عمل كامل).

يحتوي كل منهما: deployment time + commit SHA، error/failed-request counts، p95 per endpoint، auth failures، unexpected permission denials، DB errors، user-reported issues، Decision (stable / watch / rollback candidate).

### 4. KPI Dashboard مُحدَّث (D-78)

`docs/phase-reports/kpi-dashboard.md` يُحدَّث بعد كل تسليم بالمؤشرات:
- Delivery pass rate > 90%، Build success > 95%، Escaped bugs → 0، Rollback 0/rare.
- Critical flow regression 0، Auth/permission incidents 0.
- p95 ضمن budget لكل critical endpoint.
- Coverage: ≥ 70% عام / ≥ 90% critical.

### Enforcement Policy (D-78 §9 — صفر tolerance)

```
No delivery is accepted unless the developer submits BOTH:
  (a) 13-gate CI run passing (test evidence).
  (b) Delivery Quality Report (13-section) in docs/phase-reports/.

No critical business flow may be changed without regression proof.
No API or DB change may be accepted without contract + migration verification.
No production deployment without T+1h and T+24h monitoring reports.
```

**أي ادعاء "مرحلة مكتملة" بلا الحزم الأربع = غير صادق** (قاعدة 0 tolerance).

---

## المراحل

### Phase 0 — الأساس (Foundation) — **L (5-7 أيام)**

**الهدف**: مشروع يبني، schema كاملة، معاملات حقيقية، بدون أي شاشة.

**المهام الفنية**:
1. إنشاء Next.js 16 مع TypeScript strict + Tailwind v4 + ESLint.
2. تثبيت: `drizzle-orm`, `@neondatabase/serverless`, `ws`, `zod`, `@tanstack/react-query`, `zustand`, `next-auth@beta`, `bcryptjs`, `recharts`, `groq-sdk`, `fuse.js`, `shadcn/ui`.
3. هيكل `src/` النهائي:
   ```
   src/
   ├── app/                    # Next.js pages + API routes
   │   └── api/
   ├── components/
   │   ├── ui/                # shadcn primitives
   │   ├── layout/
   │   ├── data-table/
   │   ├── forms/
   │   └── dialogs/
   ├── db/
   │   ├── client.ts          # Pool + withTx
   │   ├── schema/            # 36 جدول مقسَّم per-domain
   │   └── migrations/
   ├── lib/
   │   ├── env.ts             # Zod-validated env
   │   ├── money.ts, tva.ts, ref-codes.ts, soft-delete.ts
   │   ├── api-auth.ts, api-errors.ts
   │   ├── can.ts             # permission helper
   │   └── date.ts            # Europe/Paris helpers
   ├── modules/               # business logic per domain
   │   ├── orders/{queries,schemas,helpers}.ts
   │   ├── voice/{prompt,normalizer,resolver,...}.ts
   │   └── ...
   ├── stores/                # Zustand
   ├── middleware.ts          # DB-driven role gates
   └── types/
   ```
4. Drizzle schema كامل (36 جدول، كل ملف ≤300 سطر).
5. `src/db/client.ts`:
   ```ts
   import { drizzle } from 'drizzle-orm/neon-serverless';
   import { Pool, neonConfig } from '@neondatabase/serverless';
   import ws from 'ws';
   neonConfig.webSocketConstructor = ws;
   const pool = new Pool({ connectionString: env.DATABASE_URL });
   export const db = drizzle(pool);
   export const withTx = db.transaction.bind(db);
   ```
6. `drizzle-kit generate` + `drizzle-kit migrate` — أول migration مُلتزم.
7. `src/lib/env.ts` مع Zod validation (يرمي خطأ واضح إذا نقص env).
8. Vitest setup + أول اختبار (`money.ts` round2).
9. `next build` يمر مع strict TS.

**المخاطر والمعالجة**:
- ⚠️ **Neon HTTP لا يدعم transactions** → الحل: استخدام `neon-serverless` WebSocket Pool حصرياً للكتابات. اختبار transaction متعددة في CI.
- ⚠️ **التلوث بين ملفات schema** → الحل: كل domain ملف مستقل، re-export من barrel `src/db/schema/index.ts`.
- ⚠️ **drizzle-kit يطلب DB connection لـ generate** → الحل: إعداد `drizzle.config.ts` مع `DATABASE_URL_UNPOOLED` (direct connection).

**بدائل مرفوضة**:
- Prisma: أثقل، generation step، دعم ضعيف لـ edge.
- Raw SQL: يفقد type-safety ويجعل migrations يدوية.

**Deliverable**: `next build` يمر. `drizzle-kit migrate` ينفِّذ بلا خطأ. وحدة اختبار واحدة تمر.

---

### Phase 1 — Auth + Layout + Permissions — **M (4-6 أيام)**

**الهدف**: 6 أدوار يمكنها تسجيل الدخول ورؤية sidebar مخصَّص، مع تطبيق صلاحيات من DB.

**المهام الفنية**:
1. Auth.js v5: `src/auth.ts` مع CredentialsProvider، JWT strategy، bcrypt compare.
2. Seed أول مستخدم `admin` عبر `/api/init` (POST بـ body محمي بـ phrase).
3. `src/middleware.ts` يقرأ `permissions` من DB (مع cache 60s) ويُطبِّق الحواجز:
   ```ts
   const allowed = await can(session.user, resource, 'view');
   if (!allowed) return redirectToDefault(session.user.role);
   ```
4. Seed افتراضي لجدول `permissions` يطابق `15_Roles_Permissions.md` (6 أدوار × ~15 resource × 5 actions).
5. AppLayout:
   - Sidebar (drawer mobile < 1024px / fixed desktop ≥ 1024px)
   - Topbar: breadcrumbs + bell placeholder + user menu
   - RTL-first classes (`dir="rtl"` على `<html>`)
6. Sidebar data-driven من `permissions` (لا hardcoding).
7. ~~Command Palette (Ctrl+K)~~ → **نُقل إلى Phase 6** (D-71 / reviewer decision 2026-04-21). لا يُنفَّذ في Phase 1.
8. API: `/api/auth/*`, `/api/health`, `/api/init` (POST مع confirm phrase `"احذف كل البيانات نهائيا"` في بيئة dev فقط).
9. صفحات shell فارغة لكل route (placeholder).

**المخاطر والمعالجة**:
- ⚠️ **Auth.js v5 beta قد يتغيَّر** → الحل: pin على إصدار محدَّد في package.json، إعادة مراجعة عند كل upgrade.
- ⚠️ **Middleware يُنفَّذ على Edge runtime افتراضياً** → الحل: إذا احتاج DB access، إجبار Node runtime عبر `export const runtime = 'nodejs'`. لكن الـ cache يُغني عن ذلك.
- ⚠️ **الـ permission cache خطر التقادم** → الحل: invalidation على POST `/api/permissions` (في Phase 5 UI). في البداية TTL 60s مقبول.

**بدائل مرفوضة**:
- Clerk / Auth0: تكلفة مستقبلية + تبعية خارجية.
- الاحتفاظ بـ role hardcoding في middleware: هشّ، يتطلَّب deploy لكل تعديل صلاحية.

**Deliverable**: تسجيل دخول بـ 6 أدوار يعمل؛ sidebar مقيَّد؛ `/api/auth/session` يعيد الدور.

---

### Phase 2 — البيانات المرجعية + الكتالوج — **XL (8-12 يوم)**

**الهدف**: 10+ صفحات CRUD كاملة مع design system مكتمل.

**المهام الفنية**:
1. **Design System** (كل ملف ≤300 سطر):
   - `PageShell`, `DataTable` (sort + filter + CSV export + **mobile cards من اليوم الأول**).
   - `FormCard`, `SummaryCards`, `FilterBar`, `DetailDialog`, `ConfirmDialog`.
   - `SmartSelect` (combobox مع `.includes()` filtering؛ يُوسَّع لـ Fuse.js في Phase 5 للصوت).
   - `ImageUpload` (Vercel Blob، max 5 MB، webp/jpg).
2. `useLiveQuery` hook: TanStack Query مع `refetchInterval: 60_000` + 3-layer guard (visibility + modal + active input + 8s interaction grace).
3. **قاعدة mobile-first**: كل DataTable تعرض `DataCardList` عند `< 768px`. اختبار على جهاز حقيقي قبل إغلاق التذكرة.
4. **Users CRUD**: 6 أدوار + نموذج bonus rate overrides.
5. **Clients CRUD**: composite unique `(name, phone) WHERE phone != ''` و `(name, email) WHERE email != ''`. أمبيغويتي handler: إرجاع `candidates[]` بدل الإنشاء الأعمى.
6. **Suppliers CRUD** (نفس نمط العملاء).
7. **Products CRUD**: CRUD كامل + images (multi) + `product_commission_rules` لكل فئة + `gift_pool` eligibility + specs JSONB + `catalog_visible` flag.
8. **Inventory counts**: نموذج إدخال + تقرير فروقات (expected vs actual).
9. **Catalog PDF**: 3 لغات (AR/EN/FR)، بدون أسعار، `catalog_visible=true` + `active=true`.
10. **Settings page**: shop identity + defaults + backup download (C4). الحقول `shop_iban` و `shop_bic` تتطلب قيم غير فارغة.
11. API routes (each ≤300 سطر). كل domain له `src/modules/<domain>/queries.ts` منفصل.

**المخاطر والمعالجة**:
- ⚠️ **4383-line monolith إغراء** → الحل: قاعدة ≤300 سطر صارمة. ESLint rule `max-lines` على 300 لـ `src/**`.
- ⚠️ **Mobile regressions إذا ما اختُبرت** → الحل: كل PR لـ DataTable يتطلب لقطة شاشة من mobile (أو Playwright visual regression في Phase 5).
- ⚠️ **Vercel Blob quota (500 MB free)** → الحل: ضغط صور العميل قبل الرفع (browser-image-compression)، max 5 MB per image.

**بدائل مرفوضة**:
- MUI / Chakra: ثقيلة وتتصادم مع Tailwind.
- AG Grid: تكلفة + زائدة عن الحاجة.

**Deliverable**: 10 صفحات CRUD؛ رفع 3 صور لمنتج؛ CSV export لـ clients؛ catalog PDF بـ 3 لغات.

---

### Phase 3 — الطلبات متعددة الأصناف + الإلغاء + التحضير + المشتريات + المصاريف — **XXL (12-16 يوم)** — **✅ Closed (2026-04-20)**

> **Closing baseline**: `0151b0f`. Full gate evidence + non-blockers: [`docs/phase-reports/phase-3-closure-report.md`](phase-reports/phase-3-closure-report.md).
> **Frozen scope (reviewer decision 2026-04-20)**: Phase 3 = `orders + order_items + preparation + cancellation C1 + purchases + expenses` **فقط**. Deliveries + invoices + treasury + bonuses settlement + settlements screen مؤجَّلة إلى Phase 4 ولا تُستورَد قبل تعديل صريح للخطة.

**الهدف**: تدفق البيع حتى الجاهزية للتسليم بما فيه multi-item، خصومات، هدايا، VIN، شاشة الإلغاء C1، المتوسط المرجح للمشتريات، التحضير.

**المهام الفنية**:
1. **`orders` + `order_items`** — كل item: `product_name, category, quantity, unit_price, cost_price (snapshot), recommended_price (snapshot), line_total, discount_type, discount_value, is_gift, vin`.
2. **Price floor enforcement**:
   - Sellers يرون رسالة `"غير مقبول"` (بدون كشف buy_price).
   - Admin/Manager يرون القيم التفصيلية.
   - التحقق في Zod refine + double-check على server.
3. **VIN**: حقل `settings.vin_required_categories` (JSON array). VIN مطلوب لكل order_item في هذه الفئات عند POST وعند الانتقال إلى `تم التوصيل` (التحقق الثاني ينفَّذ في Phase 4 عند تسليم).
4. **Discount engine**: `max_discount_seller_pct=5`, `max_discount_manager_pct=15`, pm/gm بلا سقف. التحقق قبل الحفظ.
5. **Gift logic**: `is_gift=true` → `unit_price=0, line_total=0`. التحقق أن الكمية ≤ `gift_pool.remaining_quantity` ثم decrement مع `FOR UPDATE`.
6. **Commission rules**: جدول `product_commission_rules` per-category + fallback إلى settings + override إلى `user_bonus_rates` (تُقرَأ فقط في Phase 3؛ حساب الـbonus فعلياً في Phase 4).
7. **Cancellation C1**: 3 خيارات كما في `09_Business_Rules.md` BR-18. Transaction واحدة تُطبِّق:
   - `orders.status = 'ملغي'`
   - `return_to_stock` → UPDATE `products.stock += qty` مع FOR UPDATE
   - `seller_bonus_action`:
     - `keep` → `bonuses.status = 'retained'`
     - `cancel_unpaid` → **soft-delete لصف bonus** (`deleted_at=NOW(), deleted_by=actor`). ممنوع DELETE SQL (D-04/30_Data_Integrity). إذا لا يوجد أصلاً صف bonus (Phase 3 قبل حساب العمولات) → no-op.
     - `cancel_as_debt` → INSERT negative settlement row (يمر في Phase 4 عبر screen التسويات؛ في Phase 3 يُسجَّل intent فقط في صف `cancellations`).
   - `driver_bonus_action`: نفس الأنماط.
   - Refund إذا paid_amount > 0 (INSERT `payments` type=refund + signed TVA). الدفع غير متاح للـ seller في Phase 3 فعلياً (collections في Phase 4)؛ لكن البنية جاهزة.
   - INSERT `cancellations` audit row
   - INSERT `activity_log` (hash-chain — helper موحَّد)
   - Idempotency: رفض إذا `status='ملغي'` مسبقاً (409 `ALREADY_CANCELLED`). الـIdempotency-Key header يحجز صفاً في `idempotency_keys` ضمن نفس transaction.
8. **Preparation board** (`/preparation` — stock_keeper):
   - قائمة طلبات `status='محجوز'` جاهزة للتحضير.
   - `POST /api/v1/orders/[id]/start-preparation` → ينقل إلى `قيد التحضير`.
   - `POST /api/v1/orders/[id]/mark-ready` → ينقل إلى `جاهز`.
   - كل انتقال يكتب activity_log + يحترم state-machine في `08_State_Transitions.md`.
9. **Purchases + C5**:
   - `POST /api/v1/purchases` (`addPurchase`) → weighted average update للـ product.buy_price + stock += qty + activity_log.
   - `POST /api/v1/purchases/[id]/reverse` (C5 — **ليس DELETE** لمطابقة 35_API_Endpoints + 30_Data_Integrity) → إما refund cash (مسار صندوق) أو supplier credit (مسار دائن). INSERT صف purchase عكسي أو reversal entries + activity_log.
   - Soft-delete على purchase row نفسها لا يستبدل الـreverse — المعادلة المالية تمر عبر reversal entries حفاظاً على التدقيق.
10. **Expenses**:
    - `GET/POST/PUT /api/v1/expenses` + `/api/v1/expenses/[id]` — **لا DELETE** (D-04).
    - التصحيح عبر reverse entry سالب منفصل (PUT للسطر الأصلي لا يُستخدم للإلغاء، فقط للتعديل التحريري قبل الاستخدام).
11. `activity_log` writes في **كل mutation** (قبل COMMIT، داخل نفس transaction، عبر helper `logActivity(tx, …)` يحسب `prev_hash` + `row_hash` — audit.ts line 4).
12. `idempotency_keys` writes على endpoints التي تقبل `Idempotency-Key` header (create order + cancel + start-preparation + mark-ready + purchase add/reverse + expense create/update) — عبر wrapper على مستوى route يخزّن `endpoint + request_hash + username + response + status_code` — audit.ts line 39.

**المخاطر والمعالجة**:
- ⚠️ **تعقيد الـ cancellation transaction** → الحل: test coverage قبل الـ UI. 8 invariants توثَّق في `08_State_Transitions.md`.
- ⚠️ **Race condition في gift_pool decrement** → الحل: `SELECT ... FOR UPDATE` على `gift_pool` داخل transaction.
- ⚠️ **Weighted-average precision loss** → الحل: حساب في BigDecimal (عبر `toCents`/`fromCents`) ثم round2 في النهاية.
- ⚠️ **المستخدم قد يختار `cancel_as_debt` لعمولة غير مصروفة** → الحل: UI يمنع هذا الاختيار إلا إذا `settled=true` (validation server-side كاحتياط).

**بدائل مرفوضة**:
- حذف rows الطلبات/الفواتير/العمولات/المشتريات/المصاريف مباشرةً: يكسر التدقيق + يفقد التاريخ المالي (D-04).
- خيارين بدل 3 في C1: يفقد حالة الدين الاسترداد — وهي ضرورية محاسبياً لتوثيق دين الموظف بعد صرف عمولة أُلغيت.
- DELETE على purchases/expenses: يتعارض مع 35_API_Endpoints — الطريقة الكنسية `reverse` للمشتريات و reverse entry سالب للمصاريف.

**Deliverable**: إنشاء طلب 3 أصناف + هدية + خصم 5% (seller) + VIN؛ start-preparation + mark-ready يعملان؛ إلغاء مع كل من 8 invariants (C1–C8) يمر (soft-delete للـbonus، لا DELETE)؛ purchase + reverse (refund) + reverse (supplier credit) تعمل؛ expense create/update/no-delete موثَّقة؛ activity_log hash-chain صحيح لكل mutation؛ Idempotency-Key replay يعمل.

---

### Phase 4 — التوصيل + الصناديق + الفواتير + العمولات + التسويات — **XXL (12-16 يوم)**

#### Phase 4 Closure Criteria (canonical — baseline `fba93e4`, reviewer decision 2026-04-21)

**إغلاق Phase 4 مشروط حصرياً بهذه الأربع** — كلها committed محلياً على baseline `fba93e4`:

1. ✅ **Deliveries + confirm + collection** (Phase 4.0 + 4.0.1 + 4.0.2 — committed).
2. ✅ **Invoice core + PDF + avoir** (Phase 4.1 + 4.1.1 + 4.1.2 committed؛ **avoir core** في Phase 4.5 — committed at `1cab312` + post-review fixes at `fba93e4`).
3. ✅ **Treasury core + handover + transfer + reconcile** (Phase 4.2 + 4.2.1 committed؛ transfer + reconcile في Phase 4.3؛ money-precision 2-decimal في Phase 4.3.1 + 4.3.2).
4. ✅ **Settlements + `/my-bonus` + `cancel_as_debt`** (Phase 4.4 — BR-18 / BR-19 closed؛ UI completion + canonical-API + nav sync في Phase 4.4.1 at `5807b3b`).

**مؤجَّل صراحة إلى ما بعد Phase 4 — NOT a closure blocker**:
- **`/api/v1/distributions`** (Profit Distributions) → **Phase 6**. المبرِّر: expert-comptable يتولاها خارج النظام.
- **Dashboards الثقيلة** (6 dashboards per-role + charts + widgets) → **Phase 5**.
- **Reports dashboards** (P&L 3 views + seller performance + profit per order + top clients/suppliers) → **Phase 5**.
- **Activity log explorer UI** (`/activity`) → **Phase 5** (الـDB + hash chain موجودان منذ Phase 3).
- **Notifications expansion** (email/SMS channels، إشعارات advanced) → **Phase 5**.
- **Voice system** (Groq STT + NLP) → **Phase 5** مع re-evaluation.
- أي ميزة من Phase 5 / 6 بشكل عام.

**خطوات إغلاق Phase 4 بعد baseline `4ba4c65`** (tranche واحدة في كل خطوة، Contract → تنفيذ → Self-Review → D-78 → gates → local commit → توقف):
- ✅ **Step 1** → Phase 4.3 (Treasury transfer + reconcile، أربع categories فقط: funding / manager_settlement / bank_deposit / bank_withdrawal) — committed `ef5c57f` + 4.3.1 `e67cb26` + 4.3.2 `e0c8d20`.
- ✅ **Step 2** → Phase 4.4 (Settlements + `/my-bonus` read-only + cancel_as_debt → negative settlement) — committed `e86d265` + 4.4.1 UI+nav `5807b3b`.
- ✅ **Step 3** → Phase 4.5 (Avoir core: POST /api/v1/invoices/[id]/avoir + avoir PDF) — committed `1cab312` + post-review fixes `fba93e4`.
- ✅ **Step 4** → Phase 4 Closure Pack (docs-only reconciliation) — this commit.

#### Scope النصي الأصلي (reviewer decision 2026-04-20)

> preparation board نُقل إلى Phase 3. Phase 4 يبدأ من `جاهز` ويغطي التسليم + الفواتير + الصناديق + حساب العمولات الفعلي + التسويات + الأرباح.

**ملاحظة**: قائمة المهام التفصيلية التالية (1..13) تبقى كما هي للرجوع التاريخي، لكن بنود **8 (`/distributions`)، 10 (6 dashboards)، 11 (Reports)، والأطراف المذكورة تحت "Activity log UI"** تنتمي الآن رسمياً إلى **Phase 5 / 6** وليست blocker لإغلاق Phase 4.

**الهدف**: end-to-end flow من طلب جاهز إلى تسوية يومية متوازنة.

**المهام الفنية**:
1. `/deliveries` — Driver يؤكد per-item. عند التأكيد `status='تم التوصيل'` → transaction واحدة تُنفِّذ:
   - التحقق من VIN لكل item في فئة VIN-required.
   - INSERT `invoices` (+ atomic `invoice_sequence` counter per month).
   - حساب `calculateBonusInTx` لكل order_item (seller + driver).
   - INSERT `payments` (type='collection'، amount=paid_amount). TVA غير مخزَّنة — محسوبة فقط عند render الفاتورة (D-02).
   - INSERT `treasury_movements` (driver custody inflow).
   - INSERT `activity_log` (hash-chain).
2. `/driver-tasks` — كيان جديد. Types: `delivery | supplier_pickup | collection`.
3. **Driver dashboard**: my tasks + my bonuses.
4. **Stock keeper dashboard (Phase 4 extension)**: inventory counts + low-stock alerts (preparation queue نفسها في Phase 3).
5. **Hierarchical treasury**:
   - `treasury_accounts`: types = `main_cash | main_bank | manager_box | driver_custody` مع `parent_account_id`.
   - `treasury_movements`: from/to accounts + category.
   - `/treasury`: balances per account + transfers + daily reconciliation form.
6. **`/invoices`** — PDF متعدد الأصناف بالفرنسية:
   - Header: logo + ref + date + status pill (3-state: `EN ATTENTE | PARTIELLE | PAYÉE | ANNULÉE`).
   - Parties: Vendeur (SIRET + SIREN + APE + N° TVA) | Client.
   - Lines: Désignation | Qté | Prix Unit. HT | Total HT.
   - Totals: Sous-total HT | TVA 20% | TOTAL TTC.
   - Payment history: conditional table.
   - Bank block (IBAN/BIC من settings).
   - Stamp: `/stamp.png`.
   - Footer: SIRET | SIREN | APE | ref | contact + timestamp.
7. **`/settlements`**: bonus payouts + rewards + **negative settlements** (debt from cancel-after-paid — intent سُجِّل في Phase 3 ضمن صف `cancellations`؛ Phase 4 يُنشئ صف settlement سالب مقابل). Live credit probe endpoint.
8. **`/distributions`**: profit-distribution groups مع `pg_advisory_xact_lock(hashtext(period_key))` للحماية من السباقات.
9. **`/my-bonus`**: per-user bonus list مع filters.
10. **6 dashboards** per-role:
    - `pm/gm`: P&L (cash + accrual + projected) + alerts
    - `manager`: team performance + cash box status
    - `seller`: own sales + own bonuses (bounded date window)
    - `driver`: own tasks + own bonuses + custody balance
    - `stock_keeper`: inventory variance + low stock alerts
11. **Reports**: P&L (3 views)، seller performance، profit per order، top clients/suppliers.
12. **`/api/cron/daily`** (03:00 Europe/Paris، D-23) — يوميّاً واحد مدمج:
    - تذكير `reconciliation` للـ managers/GM.
    - قلب `payment_schedule.status = 'overdue'` للدفعات المتأخرة.
    - cleanup: `activity_log > 90d` + `voice_logs > 30d` + `notifications` المقروءة > 60d + `idempotency_keys` expired + Blob cleanup للمنتجات `active=false > 30d`.
13. **`/api/cron/hourly`** (D-23) — كل ساعة:
    - prune `voice_rate_limits` windows منتهية.
    - dispatch إشعارات مُؤجَّلة.

**المخاطر والمعالجة**:
- ⚠️ **PDF generation قد يتخطى 5s** → الحل: استخدام `@react-pdf/renderer` (سريع) وتحرير الـ connection بعد flush. المقاس المتوقع لـ 3-item invoice ~800ms.
- ⚠️ **Race في invoice_sequence** → الحل: `SELECT ... FOR UPDATE` ثم `INCREMENT` داخل transaction.
- ⚠️ **Treasury reconciliation انحراف** → الحل: الحركة التصحيحية تُسجَّل بـ `type='reconciliation'` و `category='reconciliation'` لعدم خلطها بالحركات التشغيلية.
- ⚠️ **SSE رغبة النظام** → **محذوف (D-41)**. Polling فقط — Neon HTTP لا يدعم LISTEN/NOTIFY و Vercel timeout 300s يقطع stream.
- ⚠️ **التعقيد الكلي للمرحلة** → الحل: تقسيمها داخلياً إلى 4 sub-phases، كل واحدة deploy لـ preview قبل الاندماج.

**بدائل مرفوضة**:
- إنشاء PDF عند طلب المستخدم (not cache): بطيء. Cache على Vercel Blob بعد أول render + invalidate عند تعديل.
- تخزين TVA total مسبقاً: يُكرِّر المعلومة + يخاطر بانحراف (derived, not stored).

**Deliverable**: تدفق كامل (طلب → تحضير → تأكيد سائق → invoice PDF → treasury movement → `/my-bonus` → reconciliation متوازن). **أول deploy production**.

---

### Phase 5 — Notifications + Activity + Dashboards/Reports + Voice (re-eval) + Polish — **XL (8-12 يوم)**

**الهدف (الترتيب الكنسي المعتمَد 2026-04-22)**: (1) notifications → (2) activity explorer → (3) dashboards + reports → (4) voice (re-eval أولاً، وإن اعتُمد تنفيذ كامل) → (5) polish.

**خارج نطاق Phase 5 (مؤكَّد — كلها Phase 6)**: Permissions UI، `/distributions`، Command Palette (Ctrl+K).

**المهام الفنية**:
1. **Notifications**:
   - جدول `notifications` + `notification_preferences`.
   - **on-demand fetch (D-42)** عند فتح Bell Dropdown. لا polling مستقل للـ badge.
   - Badge count يُرفَع عبر `X-Unread-Count` response header في كل API عادية.
   - `/notifications` full-list page (pagination 50/page).
   - **DataTables**: polling 90s adaptive → 180s بعد 3 دقائق idle (D-42).
   - **لا SSE (D-41)** — محذوف.
   - أحداث: order created/confirmed/cancelled, payment overdue, low stock, settlement due, etc.
2. **Activity log UI**: `/activity` مع filters (entity_type + date range + user). PM/GM فقط. Manager يرى فقط نشاط فريقه. الـ DB + hash chain موجودان منذ Phase 3.
3. **Dashboards + Reports**: `/dashboard` (role-scoped KPIs + charts) + reports (P&L 3 views + seller performance + profit per order + top clients/suppliers). **ملاحظة**: `/action-hub` يبقى home لـ pm/gm/manager (D-72) — `/dashboard` صفحة deep-analysis وليست الصفحة الأولى.
4. **Voice system** — **re-evaluation أولاً**. إذا اعتُمد الاستمرار، تنفيذ كامل حسب [`32_Voice_System.md`](requirements-analysis/32_Voice_System.md):
   - Modules: `normalizer`, `blacklist`, `prompt`, `action-classifier`, `entity-resolver`, `alias-generator`.
   - Routes: `/api/voice/process`, `/api/voice/learn`.
   - `VoiceButton.tsx` مع Web Audio RMS silence detector.
   - `VoiceConfirmModal.tsx` — form قابل للتعديل قبل الحفظ.
   - Rate limit 10/60s per user — **مُخزَّن في جدول Neon `voice_rate_limits (username, window_start, count)`** (لا in-memory Map، لأن Fluid Compute cold-starts تُفقد الذاكرة). الجدول يُنظَّف عبر `/api/cron/hourly` (D-23).
   - Multi-item: `sale.items[]` في JSON schema.
5. **Dark mode** عبر CSS variables في Tailwind v4.
6. **Empty states** لكل DataTable + keyboard shortcuts (J/K للتنقل، E للتعديل، Delete للحذف مع confirm).
7. **Printable invoice view** (`/invoices/[id]/print`).
8. **PWA**: `public/manifest.json` + `service-worker.js` عبر `next-pwa` (cache static assets + offline fallback).
9. **Vitest suites**:
   - CI job يُنشئ Neon branch ephemeral لكل run (API call قبل + حذف بعد).
   - Unit tests: normalizer, resolver, money, tva (بلا DB).
   - Integration tests: كل business rule في `09_Business_Rules.md` يقابله اختبار.
   - Target: ~200+ اختبار، coverage > 70%.
10. مهام retention و cleanup تنتقل إلى `/api/cron/daily` من Phase 4 (لا cron إضافي في هذه المرحلة — حصة Vercel Hobby = 2 فقط، D-23).

**المخاطر والمعالجة**:
- ⚠️ **Voice rate limit عبر in-memory Map قد يُفقد عند cold-start** → الحل الموثَّق: جدول Neon `voice_rate_limits` (D-14، راجع `32_Voice_System.md` و `17_Security_Requirements.md`). بديل أخف (Upstash Redis) مُؤجَّل إذا كان Neon round-trip بطيئاً جداً في القياسات.
- ⚠️ **Groq API outage** → الحل: error handling واضح + fallback إلى نموذج إدخال يدوي. Voice log يحفظ `status='groq_error'`.
- ⚠️ **Vitest مع Neon branch creation** → الحل: ephemeral branch عبر Neon API قبل كل CI run، مع teardown في `afterAll`.
- ⚠️ **PWA cache staleness** → الحل: service-worker strategy = network-first للـ API routes، cache-first للـ static assets.

**بدائل مرفوضة**:
- Push notifications (Web Push API): تعقيد + دعم ضعيف على iOS قبل 2026.
- SSE افتراضياً: polling أبسط وأرخص للـ Free tier.

**Deliverable**: صوت "بيع دراجة V20 وخوذة لأحمد" → modal → confirm → 2-item order. ~200+ اختبار يمر على CI. PWA قابل للتثبيت على الموبايل.

---

### Phase 6 — Permissions UI + /distributions + Mobile-Readiness + Polish — **M (5-7 أيام)**

**الهدف**: ثلاث ميزات UI مُؤجَّلة من Phase 4/5 (Permissions matrix interactive، Profit Distributions، Command Palette) + تجهيز API للاستهلاك من موبايل + تحسينات أداء مبنية على القياس.

**المهام الفنية**:
1. **Permissions matrix UI** (`/permissions`): مصفوفة interactive 6×N (6 roles × resources × actions) لـ PM فقط. واجهة على الـ `/api/v1/permissions` الـ GET/PUT الموجود منذ Phase 1. invalidation فوري للـ permission cache عند الحفظ.
2. **Profit Distributions** (`/api/v1/distributions` + `/distributions` UI): pm/gm يُنشئون groups للفترات، `pg_advisory_xact_lock(hashtext(period_key))` للحماية من السباقات، تتبّع `distributed` مقابل `distributable`.
3. **Command Palette (Ctrl+K)**: بحث في routes المسموحة للمستخدم (من `/api/v1/me.nav`). Keyboard-first (D-71 polish).
4. **OpenAPI من Zod**: script يحوِّل كل Zod schema إلى OpenAPI 3.1 spec → `public/openapi.json`.
5. **API versioning**: نقل كل routes إلى `/api/v1/*`. إبقاء `/api/*` كـ alias خلال فترة انتقالية.
6. **Perf audit**:
   - إضافة `EXPLAIN ANALYZE` على أبطأ 10 endpoints.
   - Neon console → slow query log.
   - Missing indexes → هجرة جديدة.
7. **Read-only Neon role** للتقارير:
   ```sql
   CREATE ROLE reporter LOGIN PASSWORD '...';
   GRANT CONNECT ON DATABASE neondb TO reporter;
   GRANT USAGE ON SCHEMA public TO reporter;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO reporter;
   ```
   استخدامه من lambda reporting job.
8. **Retention verification**: تأكد من أن الـ 2 cron jobs (`daily` + `hourly`) تعمل ضمن حصة Vercel Hobby؛ Vercel Cron dashboard (D-23).
9. **Sentry integration** (اختياري على الـ free tier): error tracking + performance tracing.
10. **Lighthouse audit** على أهم 5 صفحات، الحد الأدنى 90 على mobile + desktop.
11. **Documentation pass**:
    - كل helper له JSDoc.
    - README.md في جذر المشروع.
    - `docs/onboarding.md` لأي مطوِّر جديد.

**المخاطر والمعالجة**:
- ⚠️ **Zod → OpenAPI mapping غير ممتاز للـ refine** → الحل: مكتبة `@asteasolutions/zod-to-openapi` تغطي 95٪. للباقي، تعليق يدوي.
- ⚠️ **Sentry مجاني قد يُطفأ لاحقاً** → الحل: code لا يعتمد عليه — wrapper اختياري.

**Deliverable**: OpenAPI spec مُولَّد؛ 0 slow query > 500ms؛ Lighthouse ≥ 90 على 5 صفحات.

---

## الجدولة الإجمالية

| المرحلة | المدة المقدَّرة | تراكمي |
|---------|---------------|--------|
| Phase 0 | 5-7 أيام | 1 أسبوع |
| Phase 1 | 4-6 أيام | 2 أسابيع |
| Phase 2 | 8-12 يوم | 4 أسابيع |
| Phase 3 | 12-16 يوم | 6 أسابيع |
| Phase 4 | 12-16 يوم | 8 أسابيع |
| Phase 5 | 8-12 يوم | 10 أسابيع |
| Phase 6 | 5-7 أيام | 11 أسبوع |

**الهدف الكلي**: ~11 أسبوع (2.5 شهر) إلى production-ready. **Production launch بعد Phase 4** (~8 أسابيع).

---

## مبادئ التنفيذ الصارمة

1. **لا ملف > 300 سطر**. ESLint `max-lines: 300` على `src/**`.
2. **TypeScript strict** في كل مكان — لا `any`.
3. **كل قاعدة تجارية تُختبر** في Vitest قبل أو مع الـ UI.
4. **كل رسالة خطأ للمستخدم تبدأ بالعربية** (convention: الـ middleware يُمرِّر الرسالة كما هي إذا بدأت بـ Arabic Unicode range؛ وإلا تُخفَى خلف fallback).
5. **كل mutation يكتب في `activity_log`** داخل نفس الـ transaction.
6. **Soft-delete افتراضي** لكل جدول حركي/مالي.
7. **كل `withTx` يحتوي transaction كاملة** — لا mixing بين tx و non-tx في نفس الطلب.
8. **لا PRs بدون اختبارات** للـ business rules الجديدة (DataTable plumbing مستثناة).

---

## Gate قبل أي كود

- ✅ Phase 0a مكتملة: 37 ملف spec متَّسق + 25 قراراً موثَّق (D-01..D-25).
- ✅ Phase 0b مكتملة: `package.json` صادق + `.nvmrc=24` + `public/fonts/cairo/README.md` placeholder + Cron 2 endpoints + phase count موحَّد + grep audit قابل للتكرار.
- ✅ Phase 0c مكتملة: **51 قراراً جديداً** (D-26..D-76) مُطبَّق على specs + `docs/compliance/` + `38_Accessibility_UX_Conventions.md` + **7 تقارير مراجعة** في `audit-reports/` (6 داخلية + 1 خارجية). D-33 مُعلَّم SUPERSEDED بواسطة D-73.
- ✅ **D-13 v3 canonical**: 7 مراحل برمجية (Phase 0..6) + 3 تحضيرية (0a + 0b + 0c) = **10 بنود**.
- ⏳ **ينتظر**: تأكيد صريح من المستخدم بكلمة "ابدأ" لبدء Phase 0 (الكود).

**ملاحظة صدق**: حتى الآن لا يوجد `src/` — `next build` سيفشل، `vitest` لا يجد ملفات. هذا **سلوك متوقَّع** لا خلل، لأن الكود يُضاف في Phase 0 فقط.

---

## Open Questions — قبل Phase 2 أو Phase 3

| # | السؤال | الاقتراح |
|---|--------|----------|
| 1 | `shop_iban` و `shop_bic` الفعليان | المستخدم يُقدِّم قيم حقيقية قبل seed في Phase 2 |
| 2 | default admin password | توليد عشوائي ثم طباعة في stdout مرة واحدة عند init (لا `admin123`) |
| 3 | Vercel: downgrade إلى Hobby متى؟ | بعد Phase 4 (production launch). المشروع مُصمَّم للـ Hobby من اليوم الأول |
| 4 | توقيت أول backup تلقائي | لا tolérance قبل Phase 4 — backup يدوي فقط (BR-C4) |
