# مواصفات النظام — VITESSE ECO SAS v2

## نظام إدارة الطلبات والعمليات — Order & Operations Management System

> **الحالة**: Phase 0a + 0b + **0c (7 جولات مراجعة)** مكتملة. Phase 0 (الكود) **معلَّقة لتأكيد "ابدأ"**. **78 قراراً كنسياً** (D-01..D-78). D-01..D-76 مُطبَّقة على specs. **D-77 + D-78 = Delivery Acceptance Framework** (13-gate CI + 13-section report + T+1h/T+24h monitoring + KPIs — zero tolerance).
> **آخر تحديث**: 2026-04-19 (Phase 0c)
> **اللغات**: العربية (واجهة + مصطلحات تجارية) + الإنجليزية (مصطلحات تقنية)
> **الفرنسية**: فقط في الفواتير المُولَّدة (متطلب قانوني)
> **الدقة المالية**: 0.01€ — كل الأرقام TTC
> **المنطقة الزمنية**: Europe/Paris
> **مشروع جديد**: fresh build — لا ترحيل بيانات

📋 **سجل القرارات الفاصلة**: [00_DECISIONS.md](00_DECISIONS.md) — **78 قراراً** (D-01..D-78). D-01..D-76 من 7 جولات مراجعة. **D-77 (مبدأ) + D-78 (مواصفة)** = Delivery Acceptance Framework: 13-gate CI، 13-section Delivery Quality Report، T+1h + T+24h monitoring، KPIs dashboard. هو المصدر الحاكم عند أي تعارض.

---

## الرؤية

نظام متكامل لإدارة عمليات البيع والشراء والتوصيل والمخزون والمالية لشركة بيع مركبات صديقة للبيئة في فرنسا. يدعم 6 أدوار وظيفية، طلبات متعددة الأصناف، صناديق مالية هرمية، كتالوج منتجات بصور، ونظام تنبيهات فوري (polling-first). مُصمم لتجربة موحَّدة على الكمبيوتر والتابلت والموبايل، مع تجهيز لتطبيق Android (React Native) لاحقاً.

---

## المبادئ الأساسية

| # | المبدأ |
|---|--------|
| 1 | كل الأرقام المالية **TTC** — TVA تُحسب فقط عند توليد الفاتورة، ولا تُخزَّن (D-02) |
| 2 | **حذف ناعم مطلق** — لا hard delete للسجلات المالية حتى لـ PM (D-04) |
| 3 | **تجربة موحَّدة** — نفس البيانات والإجراءات على كل الأجهزة |
| 4 | **Backend = مصدر بيانات واحد** — يغذي Web + Android لاحقاً |
| 5 | **لا ملف يتجاوز 300 سطر** — تقسيم حسب المجال |
| 6 | **TypeScript صارم** في كل مكان |
| 7 | كل قاعدة تجارية **تُختبر** — لا نعتمد على الذاكرة |
| 8 | **Atomicity مالي** — كل كتابة مالية داخل `withTx` حقيقي عبر Neon WebSocket Pool (D-05) |
| 9 | **Idempotency** — كل mutation حرج يقبل `Idempotency-Key` ويتحقق من جدول `idempotency_keys` (D-16) |

---

## الأدوار (6 أدوار)

| الدور | الرمز | الصندوق المالي | الوصف |
|-------|-------|:--------------:|-------|
| مدير المشروع | `pm` | — (يرى الكل) | تحكم كامل. المالك الوحيد لصفحة `/permissions` (D-12) |
| مدير عام | `gm` | الصندوق الرئيسي | نفس صلاحيات PM **باستثناء تعديل الصلاحيات** (D-12) |
| مدير | `manager` | صندوق فرعي | يدير العمليات اليومية. يُلغي حتى حالة `جاهز` (D-11) |
| بائع | `seller` | — | بيع + تحصيل. يرى عملاءه الخاصين فقط |
| سائق | `driver` | عهدة نقدية | توصيل + جلب من موردين + تحصيل |
| أمين مخزن | `stock_keeper` | — | مخزون + جرد + تحضير طلبات (via `preparation_queue:view`) |

---

## هيكل الوثائق

### المحور أ — الأساسيات والهيكل العام

| الملف | المحتوى | المصدر الكنسي لـ |
|-------|---------|-----------------|
| `00_DECISIONS.md` | سجل **78 قراراً** فاصلاً (D-01..D-78) — 7 جولات مراجعة + Delivery Acceptance Framework (D-77 مبدأ + D-78 مواصفة) | **القرارات الكنسية — يحكم عند أي تعارض** |
| `02_DB_Tree.md` | نموذج البيانات (36 جدول) | هيكل قاعدة البيانات |
| `03_Modules_List.md` | الوحدات والصفحات (~25 صفحة في 4 أنماط) | قائمة الوحدات والصفحات |
| `04_Module_Dependencies.md` | خريطة التأثيرات المتسلسلة | الاعتماديات |
| `05_Glossary.md` | مصطلحات AR/EN | المصطلحات |
| `06_Reference_Data.md` | قيم ثابتة + فئات + أدوار | القيم المرجعية |

### المحور ب — سير العمل والقواعد

| الملف | المحتوى | المصدر الكنسي لـ |
|-------|---------|-----------------|
| `07_Workflows.md` | سيناريوهات العمل الكاملة | سير العمل |
| `08_State_Transitions.md` | مخططات الحالة لكل كيان | انتقالات الحالة |
| `09_Business_Rules.md` | جميع القواعد التجارية مرقمة | **القواعد التجارية** |
| `10_Calculation_Formulas.md` | الصيغ الحسابية (كل الأرقام TTC) | **الصيغ** |
| `11_Numbering_Rules.md` | أنماط الترقيم | الترقيم |
| `12_Accounting_Rules.md` | P&L + تدفق نقدي + صناديق هرمية | المحاسبة |
| `13_Commission_Rules.md` | عمولات حسب فئة المنتج + تجاوزات | العمولات |
| `14_Profit_Distribution_Rules.md` | آلية التوزيع + سقف + تزامن | توزيع الأرباح |

### المحور ج — الأدوار والأمان

| الملف | المحتوى | المصدر الكنسي لـ |
|-------|---------|-----------------|
| `15_Roles_Permissions.md` | مصفوفة CRUD لـ 6 أدوار × كل وحدة | **الصلاحيات** |
| `16_Data_Visibility.md` | فلترة بيانات + إخفاء أعمدة حسب الدور | رؤية البيانات |
| `17_Security_Requirements.md` | مصادقة + تفويض + تشفير + PII + pseudonymization | الأمان |

### المحور د — الواجهات

| الملف | المحتوى |
|-------|---------|
| `18_Screens_Pages.md` | خريطة الصفحات (4 أنماط × 25 صفحة) |
| `19_Forms_Fields.md` | النماذج والحقول |
| `20_Validation_Rules.md` | Zod + DB constraints |
| `21_Search_Filtering.md` | بحث + فلاتر + ترتيب + pagination |
| `22_Print_Export.md` | PDF (فواتير + كتالوج) + CSV |
| `23_Navigation_UI.md` | Sidebar حسب الدور + RTL + موبايل |

### المحور هـ — التقارير والسجلات

| الملف | المحتوى |
|-------|---------|
| `24_Reports_List.md` | التقارير |
| `25_Dashboard_Requirements.md` | لوحات تحكم مخصَّصة لكل دور |
| `26_Notifications.md` | تنبيهات (polling 90s adaptive — D-42، لا SSE — D-41) حسب الدور + جرس |
| `27_Audit_Log.md` | سجل النشاطات + آليات التدقيق + PII masking + retention split |

### المحور و — الحالات الاستثنائية

| الملف | المحتوى |
|-------|---------|
| `28_Edge_Cases.md` | الحالات الاستثنائية |
| `29_Concurrency.md` | FOR UPDATE + withTx + atomic + idempotency |
| `30_Data_Integrity.md` | FK + حذف ناعم + حماية |
| `31_Error_Handling.md` | معالجة الأخطاء + HTTP codes + Arabic-prefix convention |

### المحور ز — النظام الصوتي

| الملف | المحتوى |
|-------|---------|
| `32_Voice_System.md` | Pipeline + prompt + normalizer + resolver + rate-limit |

### المحور ح — الجوانب التقنية

| الملف | المحتوى |
|-------|---------|
| `33_Integrations.md` | التكاملات الخارجية + cron consolidation |
| `34_Technical_Notes.md` | ملاحظات تقنية + Stack |
| `35_API_Endpoints.md` | جميع الـ endpoints |
| `36_Performance.md` | فهارس + أداء + retention |
| `37_Backup_Protection.md` | نسخ احتياطي يدوي + حماية |

---

## القرارات المعتمدة

جميع القرارات الحاكمة موثَّقة في [00_DECISIONS.md](00_DECISIONS.md) بمعرِّفات D-01 إلى D-25 مع السبب والتاريخ. الجدول أدناه ملخَّص مرجعي سريع فقط:

| معرِّف | الموضوع | القرار |
|:------:|---------|--------|
| D-01 | ترقيم الفواتير | `FAC-YYYY-MM-NNNN` |
| D-02 | تخزين TVA | لا تُخزَّن — محسوبة عند render |
| D-03 | قيم status | كلها بفراغ |
| D-04 | Hard delete | ممنوع نهائياً — حذف ناعم مطلق |
| D-05 | Transactions | Neon WebSocket Pool حقيقي |
| D-06 | تعريف الإيرادات | SUM(payments.amount) signed |
| D-07 | ربح الطلب | فصل orderItemsCost عن orderGiftCost |
| D-08 | توزيع الأرباح | COGS (ليس purchases) |
| D-09 | invoice_mode | مفتاح محذوف — سلوك فقط |
| D-10 | supplier_credit | جدول suppliers.credit_due_from_supplier (خارج treasury — rename D-62) |
| D-11 | Manager cancel | حتى حالة `جاهز` |
| D-12 | GM vs PM | PM مالك `/permissions` الوحيد |
| D-13 (v3) | ترقيم المراحل الكنسي | **7 برمجية (0..6) + 3 تحضيرية (0a + 0b + 0c) = 10 بنود** |
| D-14 + D-41 | Real-time | **Polling فقط** — SSE محذوف (D-41). Notifications on-demand + DataTables 90s/180s adaptive (D-42). |
| D-15 | Node + Font | Node 24 LTS + Cairo محلي |
| D-16 | Idempotency | جدول `idempotency_keys` + header |
| D-17 | commission snapshot | `order_items.commission_rule_snapshot JSONB` |
| D-18 | C1 defaults | إلزامي مع استثناء محدَّد |
| D-19 | Retention | 90d للتشغيلي، بلا حذف للمالي |
| D-20 | FK IDs | `*_id` FK + `*_name_cached` |
| D-21 | driver_tasks.related_entity_type | CHECK enum |
| D-22 | notification_preferences.channel | `in_app` فقط للـ MVP |
| D-23 | Cron jobs | 2 endpoints فقط (daily + hourly) |
| D-24 | Admin password | عشوائي، يُطبع مرة واحدة |
| D-25 | Blob quota | 500 منتج × 3 صور × 300KB + cleanup |

---

## مراحل التطوير (D-13 — v3 canonical)

**الصياغة الكنسية (D-13 v3)**: **المشروع = 7 مراحل تطوير برمجية (Phase 0 حتى Phase 6) + 3 مراحل تحضيرية غير برمجية (Phase 0a + 0b + 0c). المجموع الكلي = 10 بنود مرقَّمة.**

| المرحلة | النوع | الهدف | الحالة | التعقيد |
|---------|------|-------|--------|---------|
| 0a | تحضيرية — وثائق | مواءمة الـ 37 spec مع 25 قراراً (D-01..D-25) + مسح السكافولد المعطَّل | ✅ مكتملة | M |
| 0b | تحضيرية — إعدادات | صدق الـ repo: package.json + `.nvmrc` + `public/fonts/cairo/` + نظافة cron + توحيد الحالة + grep audit reproducible | ✅ مكتملة | S |
| 0c | تحضيرية — 6 مراجعات داخلية + 1 خارجية | **51 قراراً جديداً** (D-26..D-76) مُطبَّق على specs + compliance/ folder + 38_Accessibility_UX + تقرير الإغلاق #07 | ✅ مكتملة | XL |
| 0 | برمجية | الأساس (TypeScript strict، Drizzle، 36 جدول، withTx حقيقي، Cairo محلي) | ⏳ معلَّقة — بانتظار "ابدأ" | L |
| 1 | برمجية | المصادقة (Auth.js v5) + Layout + الأدوار الـ 6 + DB-driven permissions | — | M |
| 2 | برمجية | صفحات CRUD + الكتالوج + DataTable + ImageUpload (3 صور/منتج) | — | XL |
| 3 | برمجية | الطلبات متعددة الأصناف + Cancellation C1 + Purchases reverse (C5) | — | XXL |
| 4 | برمجية | التوصيل + Treasury + Invoices + Bonuses + Settlements + أول production deploy | — | XXL |
| 5 | برمجية | Notifications (polling) + Voice + Polish + Vitest suite | — | XL |
| 6 | برمجية | OpenAPI docs + Perf tuning + Retention cron + analytics (API versioning مُنقل لـ Phase 0 عبر D-66) | — | M |

**الأعداد الرسمية**:
- المجموع البرمجي: **7 مراحل** (Phase 0..6).
- المجموع التحضيري: **3 مراحل** (0a + 0b + 0c).
- المجموع الكلي المرقَّم: **10 بنود**.

---

## Stack التقني

| الطبقة | التقنية |
|--------|---------|
| Framework | Next.js 16 + TypeScript strict (App Router) |
| Node | Node 24 LTS (D-15) |
| CSS | Tailwind CSS v4 + shadcn/ui |
| ORM | Drizzle ORM |
| DB Driver | `@neondatabase/serverless` — Pool (WebSocket) للكتابات، HTTP للقراءات (D-05) |
| Validation | Zod v4 |
| Data Fetching | TanStack Query |
| State | Zustand |
| Real-time | Polling فقط — Notifications on-demand + DataTables 90s/180s adaptive (D-14 + D-41 + D-42). لا SSE. |
| Auth | Auth.js v5 + **Argon2id** (D-40) — fallback bcrypt 14 |
| Charts | Recharts |
| Voice | Groq Whisper v3 + Llama 3.1 8B Instant |
| Fonts | Cairo عبر `next/font/local` (D-15) |
| Deploy | Vercel Hobby + Neon Free |
| Images | Vercel Blob (500 MB quota — D-25) |
| Testing | Vitest + Neon ephemeral branch per CI run |

---

## قواعد التوثيق

- جميع الوثائق بصيغة Markdown.
- **العربية** للمصطلحات التجارية والواجهة.
- **الإنجليزية** للمصطلحات التقنية والكود.
- **الفرنسية** في: قالب الفاتورة (SIRET, TVA, TTC/HT, mentions légales) + كتالوج PDF (اختياري).
- **كتالوج PDF** يُولَّد بـ 3 لغات: العربية / الإنجليزية / الفرنسية (يختار المستخدم).
- التوثيق يُحدَّث **قبل** كتابة أي كود.
- كل ملف يحتوي رقم العنصر + المحور + الحالة.
- عند اكتشاف تعارض بين ملفين، الحل يُضاف إلى `00_DECISIONS.md` كقرار جديد (D-26+) ويُطبَّق على الملفات المعنية.
