# سجل القرارات — Decisions Log

> **رقم العنصر**: #00 | **المحور**: أ | **الحالة**: سجل مرجعي حيّ
> **التاريخ**: 2026-04-19
> **الغرض**: يوثِّق كل قرار فاصل تم اتخاذه لحل تناقض داخلي أو لحسم غموض في المواصفات. المصدر الكنسي عند أي تعارض مستقبلي.

---

## طبيعة هذا الملف

بعد **سبع مراجعات مستقلة** للمواصفات (3 تدقيقية: docs internal consistency + code-vs-docs reality + cross-file contradictions، جولتان مراجعات صدق بعد Phase 0a و Phase 0b، لجنة سبعة خبراء في Phase 0c، ثم مراجعة خارجية للمطوِّر + rebuttal) رُصد ~178 مشكلة داخلية + 11 blocker خارجي + 3 فجوات فاتت المراجعات الداخلية. هذا الملف يحمل **76 قراراً فاصلاً** (D-01..D-76) يحلّ كل blocker مُكتشَف. تطبيق على specs:
- D-01..D-25 مُطبَّقة على specs بالكامل (Phase 0a).
- D-26..D-65 مُطبَّقة على specs بالكامل (Phase 0c — 6 جولات مراجعة داخلية).
- D-66..D-76 مُطبَّقة على specs بالكامل (Phase 0c — المراجعة الخارجية #07).
- **D-33 مُعلَّم SUPERSEDED** بواسطة D-73.

كل قرار يحمل:

- معرِّف فريد (D-01 إلى D-76).
- بيان القرار بصيغة قطعية.
- السبب/المبرِّر.
- التاريخ.
- الملفات التي يُعدَّل محتواها نتيجة القرار.

عند أي نزاع مستقبلي بين هذا الملف وأي ملف آخر في `docs/`، **هذا الملف يحكم**. يُحدَّث هذا الملف فقط بقرار صريح موثَّق ومؤرَّخ.

---

## القرارات

### D-01 — ترقيم الفواتير

**القرار**: نمط ترقيم الفواتير = `FAC-YYYY-MM-NNNN`. أربعة أرقام (zero-padded)، تسلسل شهري ذري عبر جدول `invoice_sequence (year INT, month INT, last_number INT, PK(year,month))`.

**مثال**: `FAC-2026-04-0001` لأول فاتورة في أبريل 2026.

**السبب**:
- البادئة الفرنسية (Facture) تُناسب السياق القانوني الفرنسي.
- 4 أرقام تدعم 9,999 فاتورة/شهر (زائد عن الحاجة).
- الفواصل بين السنة والشهر أوضح بصرياً من `YYYYMM` متصل.
- الترقيم شهري يُبسِّط تقارير الإعلان الضريبي.

**يستبعد**: `INV-YYYYMM-NNN` (مذكور سابقاً في 09_Business_Rules.md BR-64/BR-67 — يُحدَّث).

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `09_Business_Rules.md`، `11_Numbering_Rules.md`، `22_Print_Export.md`، `02_DB_Tree.md`، `35_API_Endpoints.md`.

---

### D-02 — تخزين TVA

**القرار**: TVA **لا تُخزَّن** في أي جدول. تُحسب فقط عند توليد PDF للفاتورة، من TTC باستخدام `settings.vat_rate`. عمود `payments.tva_amount` يُحذف من schema.

**المعادلة عند render الفاتورة**:
```
tva = round2(total_ttc × vat_rate / (100 + vat_rate))
ht  = round2(total_ttc - tva)
```

**السبب**:
- المحاسبة خارجية (expert-comptable) — هم يتولون إعلان TVA من الفواتير الـ PDF (pièces justificatives).
- المشروع يحتاج فقط أن يكون مصدر truth للمبالغ TTC؛ TVA حساب مشتق.
- يُزيل التناقض الذاتي في `12_Accounting_Rules.md` (نفس الملف كان يقول "تُخزَّن" ثم "لا تُخزَّن").
- يُبسِّط schema + يُقلِّل مخاطر data drift بين مبلغ موقَّع محسوب آلياً ومبلغ مخزَّن بشري.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md` (حذف عمود)، `12_Accounting_Rules.md` (حذف قسم التخزين)، `10_Calculation_Formulas.md`، `22_Print_Export.md`، `DEVELOPMENT_PLAN.md`.

---

### D-03 — تنسيق قيم status

**القرار**: كل قيم status في كل الجداول بالعربية بفراغ (غير شرطة سفلية).

القيم المعتمدة:

```
orders.status      : 'محجوز' | 'قيد التحضير' | 'جاهز' | 'مؤكد' | 'ملغي'
deliveries.status  : 'قيد الانتظار' | 'قيد التحضير' | 'جاهز' | 'جاري التوصيل' | 'تم التوصيل' | 'ملغي'
invoices.status    : 'مؤكد' | 'ملغي'
payment_status     : 'pending' | 'partial' | 'paid' | 'cancelled' (إنجليزي — UI فقط يُترجم)
```

**السبب**:
- العربية الطبيعية بفراغ، ليست بشرطة سفلية.
- PostgreSQL يتعامل مع القيم العربية بفراغ بدون حاجة escape.
- يظهر نظيفاً في UI بدون تحويل.
- يمنع خطأ تسجيل `قيد التحضير` (بفراغ) في مكان يتوقع `قيد_التحضير` (بشرطة) — سبب شائع لـ CHECK violations.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md` (CHECK constraints)، `06_Reference_Data.md`، `08_State_Transitions.md`، `09_Business_Rules.md`، `32_Voice_System.md`.

---

### D-04 — حذف ناعم مطلق — لا hard delete

**القرار**: الحذف الفعلي (DELETE SQL) **ممنوع نهائياً** على الجداول المالية والحركية، حتى لـ PM. المنع يُطبَّق بطبقتين:

1. لا endpoint في `35_API_Endpoints.md` يُنفِّذ DELETE على هذه الجداول.
2. على مستوى DB، يُمنح `REVOKE DELETE ON <table> FROM app_role` لكل جدول مالي.

الجداول المعنية: `orders`, `order_items`, `deliveries`, `invoices`, `payments`, `bonuses`, `settlements`, `treasury_movements`, `profit_distributions`, `cancellations`, `purchases`, `supplier_payments`, `expenses`, `invoice_sequence`.

**C6 invariant يُحذف** من قائمة الـ 8 invariants في `08_State_Transitions.md` — القائمة تصبح 7 (C1, C2, C3, C4, C5, C7, C8).

**السبب**:
- BR-48 مطلق — "لا حذف نهائي للطلبات/التوصيلات/الفواتير/المنتجات".
- يتماشى مع متطلبات الاحتفاظ في Code de Commerce (10 سنوات للسجلات المحاسبية).
- يحمي مسار التدقيق من التلاعب.
- C6 كما كانت مكتوبة تناقض BR-48 — لا يوجد سبب تشغيلي يتطلب hard delete.

**التعارض المحتمل مع GDPR Art. 17 (حق المحو)**: يُعالَج بـ pseudonymization (استبدال اسم + هاتف + بريد بقيمة مجهولة الهوية) لا بالحذف. راجع `17_Security_Requirements.md`.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `08_State_Transitions.md` (حذف C6)، `30_Data_Integrity.md`، `35_API_Endpoints.md`، `17_Security_Requirements.md` (إضافة pseudonymization).

---

### D-05 — طبقة المعاملات

**القرار**: كل الكتابات المالية تمرّ عبر `@neondatabase/serverless` Pool (WebSocket) مع `drizzle-orm/neon-serverless` `transaction()`. Neon HTTP driver يُستخدَم فقط للقراءات التي لا تتطلب atomicity.

**الكود المرجعي**:
```ts
// src/db/client.ts
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool);
export const withTx = db.transaction.bind(db);
```

**السبب**:
- Neon HTTP driver **لا يدعم** معاملات متعددة الجمل (BEGIN/COMMIT).
- كل mutation مالي في v2 يحتاج atomicity (مثال: إلغاء طلب = 4-6 جمل SQL يجب أن تنجح كلها أو تفشل كلها).
- الكود السابق في السكافولد كان يستخدم HTTP driver مع `return fn(db)` — ذلك كذبة atomicity.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `29_Concurrency.md`، `DEVELOPMENT_PLAN.md`، `02_DB_Tree.md` (قسم Drizzle Setup).

---

### D-06 — تعريف الإيرادات

**القرار**: الإيرادات في كل تقرير P&L + توزيع أرباح تُحسب كالتالي:

```
collected_net = SUM(payments.amount) WHERE type IN ('collection','refund','advance')
              AND date BETWEEN :start AND :end
              AND payments.deleted_at IS NULL
```

- `amount` موقَّع: collection موجب، refund سالب، advance موجب.
- هذا الرقم يُستخدم في:
  - صيغة #9 في `10_Calculation_Formulas.md` (net revenue).
  - صيغة `distributable` في `14_Profit_Distribution_Rules.md`.
- "revenue" المعروض في Dashboard P&L = `SUM(amount) WHERE type='collection'` (بلا refund/advance) — للعرض فقط، ليس للحساب.
- "net cash in" = `SUM(amount) WHERE type IN ('collection','refund')` — للتحقق من تطابق الصناديق.

**السبب**:
- يتسق مع convention محاسبي: net revenue = gross collections - refunds.
- advance يُعدّ revenue وقت التحصيل (نقدي)، لاحقاً يحوَّل إلى collection عند اكتمال الدفع.
- يحل التناقض بين formula #9 في 10 (كانت collection فقط) و`collected_net` في 14 (كل الثلاثة).

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `10_Calculation_Formulas.md`، `14_Profit_Distribution_Rules.md`، `24_Reports_List.md`.

---

### D-07 — صيغة ربح الطلب (تصحيح خصم الهدية المكرر)

**القرار**: تصحيح formula #13 في `10_Calculation_Formulas.md` لإزالة الخصم المكرَّر لتكلفة الهدية:

```
orderRevenue     = SUM(order_items.line_total) WHERE NOT is_gift
orderItemsCost   = SUM(cost_price × quantity) WHERE NOT is_gift    -- التكاليف للأصناف المبيعة فقط
orderGiftCost    = SUM(cost_price × quantity) WHERE is_gift         -- تكاليف الهدايا (مخصومة منفردة)
orderBonuses     = SUM(bonuses.total_bonus) WHERE bonuses.order_id = :id

orderProfit = orderRevenue - orderItemsCost - orderBonuses - orderGiftCost
```

**السبب**:
- الصيغة السابقة كانت `orderCost = SUM(cost_price × qty)` (شمل الهدايا) + `orderGiftCost` منفصل → خصم مكرَّر.
- الهدية تُنقص الربح مرة واحدة فقط (تكلفتها).

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `10_Calculation_Formulas.md` formula #13.

---

### D-08 — COGS مقابل Purchases في توزيع الأرباح

**القرار**: `14_Profit_Distribution_Rules.md` يستخدم **COGS** (`Cost of Goods Sold`)، ليس إجمالي المشتريات:

```
cogs_period = SUM(order_items.cost_price × quantity)
              JOIN orders ON order_items.order_id = orders.id
              WHERE orders.status = 'مؤكد'
              AND orders.confirmation_date BETWEEN :start AND :end
              AND order_items.deleted_at IS NULL
              AND orders.deleted_at IS NULL
```

المشتريات (`SUM(purchases.total)`) تُضاف إلى المخزون، ليس COGS. فقط ما بيع يتحول إلى COGS.

**السبب**:
- convention محاسبي قياسي.
- المشتريات في فترة قد لا تُباع بالكامل في نفس الفترة.
- Purchases = 10,000€ و COGS = 3,000€ → الأرباح القابلة للتوزيع تختلف بآلاف يورو.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `14_Profit_Distribution_Rules.md`، `10_Calculation_Formulas.md` (إضافة formula COGS explicitly).

---

### D-09 — إزالة مفتاح `invoice_mode`

**القرار**: مفتاح `invoice_mode` يُحذَف كلياً من `settings`.

- H7 "الفاتورة عند إلغاء الطلب تنتقل إلى حالة 'ملغي' بدلاً من الحذف" هو **قاعدة تجارية** تُوصَف بدون اسم مفتاح.
- Template الفاتورة ثابت (وضع واحد فقط مُنفَّذ) — لا حاجة لاختيار.
- `facture_d_acompte_separate` يُحذَف من الخطة (لم يكن منفَّذاً، كان forcing-function stub).

**السبب**: كان اسم المفتاح `invoice_mode` يحمل قيمتين مختلفتين في مصدرين كنسيين (`soft` في README H7، `single_facture_three_states` في schema seed). الحل الأنظف: إزالة المفتاح وتوصيف السلوك.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md` (seed)، `09_Business_Rules.md` BR-65، `06_Reference_Data.md`، `22_Print_Export.md`.

---

### D-10 — إزالة `supplier_credit` من treasury_movements

**القرار**:
- `supplier_credit` يُحذَف من `treasury_movements.category` CHECK.
- يُضاف عمود `suppliers.credit_due_from_supplier NUMERIC(19,2) NOT NULL DEFAULT 0` (rename عبر D-62 — كان اسمه `credit_balance`).
- عند إلغاء شراء مدفوع (C5 workflow): بدلاً من إدراج صف treasury، يُعدَّل `suppliers.credit_due_from_supplier += refund_amount`.
- عند استخدام الرصيد الدائن لاحقاً في شراء جديد: `suppliers.credit_due_from_supplier -= applied_amount` + treasury_movement عادي للفرق إذا تطلب دفعة.

**السبب**: `supplier_credit` ليس حركة نقدية — هو receivable. إدخاله في treasury_movements يُخرِّب أرصدة الصناديق النقدية.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md`، `12_Accounting_Rules.md`، `07_Workflows.md` (C5 workflow).

---

### D-11 — نطاق إلغاء Manager

**القرار**: Manager يستطيع إلغاء طلبات في الحالات: `محجوز`، `قيد التحضير`، `جاهز`. لا يستطيع إلغاء `مؤكد` (PM/GM فقط).

**السبب**: `08_State_Transitions.md` كانت تمنح Manager صلاحية الإلغاء حتى `جاهز`، بينما `15_Roles_Permissions.md` كانت تُقيِّده بـ `محجوز` فقط. Manager يحتاج مرونة تشغيلية حتى بداية التوصيل — قبل تأكيد التسليم.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `15_Roles_Permissions.md` (تعديل المصفوفة).

---

### D-12 — GM مقابل PM

**القرار**: GM = PM في كل resource/action **باستثناء واحد**: صفحة `/permissions` للـ PM فقط. GM يستطيع قراءة المصفوفة لكن لا يعدِّلها.

**السبب**:
- README قال "GM = نفس PM" لكن `15_Roles_Permissions.md` منع GM من `/permissions` كلياً.
- الحل الأمني: مالك واحد للصلاحيات = PM فقط. GM يرى لكن لا يعدِّل.
- يمنع سيناريو: GM رفَّع نفسه لصلاحيات إضافية ثم حذف PM.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `15_Roles_Permissions.md`، `README.md`.

---

### D-13 — ترقيم المراحل (الصياغة الكنسية الموحَّدة — v3)

**القرار (v3 — Phase 0c — يُلغي v1 و v2)**: الترقيم والعدّ ملزمان عبر كل الوثائق بهذه الصياغة الواحدة **حرفياً**، دون أي صياغة بديلة:

> **المشروع = 7 مراحل تطوير برمجية (Phase 0 حتى Phase 6) + 3 مراحل تحضيرية غير برمجية (Phase 0a: مواءمة الوثائق، Phase 0b: صدق الإعدادات، Phase 0c: 6 مراجعات داخلية + 1 خارجية للمطوِّر + تطبيق D-26..D-76). المجموع الكلي = 10 بنود مرقَّمة.**

**الحالات**:
- **Phase 0a** (docs) — ✅ مكتملة.
- **Phase 0b** (config) — ✅ مكتملة.
- **Phase 0c** (7 مراجعات) — ✅ مكتملة، جميع D-26..D-76 مُطبَّقة على specs. D-33 مُعلَّم SUPERSEDED بواسطة D-73.
- **Phase 0** (foundation) — ⏳ أول مرحلة برمجية، معلَّقة بانتظار "ابدأ".
- **Phases 1..6** = ميزات برمجية.

**الأعداد الرسمية**:
- **المجموع البرمجي**: **7 مراحل** (Phase 0 + 1 + 2 + 3 + 4 + 5 + 6).
- **المجموع التحضيري**: **3 مراحل** (Phase 0a + 0b + 0c).
- **المجموع الكلي المرقَّم**: **10 بنود**.

**ملزِم**: أي وثيقة أخرى (`README.md`, `DEVELOPMENT_PLAN.md`, `00_execution_plan.md`, إلخ) تستخدم هذا النص حرفياً أو تُشير إليه بـ `(D-13)`. أي صياغة تقول "مرحلتان تحضيريتان" أو "9 بنود" أو "7 + 2" = متقادمة (v1/v2) ويجب تحديثها.

**تاريخ v3**: 2026-04-19.

**الصياغات الممنوعة**:
- "6 مراحل" ← خاطئ (كان يسبب ربك العدّ).
- "مراحل 0..6" بلا توضيح ← غامض.

**السبب**: Development Plan استخدم "6 مراحل" تاريخياً، لكنه يُفهرس 0..6 (أي 7). README قال 0..8 (9). ثم أُضيف 0a ثم 0b. كل الصياغات السابقة غير دقيقة.

**التاريخ**: 2026-04-19 (مُعدَّل 2026-04-19 بعد التدقيق).

**الملفات المتأثرة**: `README.md`، `DEVELOPMENT_PLAN.md`، `implementation/00_execution_plan.md`.

---

### D-14 — Real-time = polling-first (محدَّث عبر D-41 + D-42)

**القرار الأصلي (v1)**: Polling + SSE خلف flag.
**القرار المحدَّث (v2 — D-41)**: SSE محذوف كلياً. Polling فقط.
**Cadence المحدَّث (v3 — D-42)**:
- Notifications = **on-demand** عند فتح Bell Dropdown + badge من `X-Unread-Count` header.
- DataTables = **90s** افتراضي، يُضاعَف إلى **180s** بعد 3 دقائق idle.

**السبب**:
- Neon HTTP driver لا يدعم LISTEN/NOTIFY.
- Vercel function timeout 300s يقطع SSE stream كل 5 دقائق → مقبض معطَّل.
- "Flag ready" كان ادعاء بلا تصميم.
- 20s polling × 20 user = 200h/أسبوع > Neon حصة 190h/**شهر** — خطر real.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `DEVELOPMENT_PLAN.md`، `26_Notifications.md`، `33_Integrations.md`، `35_API_Endpoints.md`، `requirements-analysis/README.md`.

---

### D-15 — Node 24 + Cairo محلي

**القرار**:
- Node 24 LTS في dev + CI + production (Vercel Hobby يدعم Node 24).
- Cairo font عبر `next/font/local` — يُزال الاعتماد على `next/font/google`.
- `.nvmrc` في الجذر يحدِّد `24`.
- `package.json.engines.node` = `>=24.0.0`.

**حالة التنفيذ** (2026-04-19):

| البند | الحالة الآن |
|------|:-----------:|
| `.nvmrc = 24` | ✅ مُلتزَم في Phase 0b |
| `package.json.engines.node >= 24.0.0` | ✅ مُلتزَم في Phase 0b |
| `@types/node ^24` | ✅ مُلتزَم في Phase 0b |
| `public/fonts/cairo/` (المجلد) | ✅ مُنشأ مع `README.md` يوثِّق العقد |
| `public/fonts/cairo/Cairo-{Regular,SemiBold,Bold}.ttf` | ⏳ **غير مُلتزَم بعد** — يُضاف في أول commit من Phase 0 |
| `public/fonts/cairo/OFL.txt` | ⏳ يُضاف في Phase 0 مع TTFs |
| استيراد `next/font/local` في `src/app/layout.tsx` | ⏳ Phase 0 (لا `src/` بعد) |

**السبب**:
- الاعتماد على Google Fonts أثناء `next build` يجعل البناء غير self-contained — يفشل بلا إنترنت.
- Node 24 LTS هو الافتراضي الحديث على Vercel.

**التاريخ**: 2026-04-19 (مُصحَّح في 2026-04-19 بعد تدقيق رابع).

**الملفات المتأثرة**: `DEVELOPMENT_PLAN.md`، `33_Integrations.md`، `34_Technical_Notes.md`، `23_Navigation_UI.md`، `public/fonts/cairo/README.md`، `package.json`، `.nvmrc`.

---

### D-16 — جدول idempotency_keys

**القرار**: يُضاف جدول:

```sql
CREATE TABLE idempotency_keys (
  key         TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  response    JSONB NOT NULL,
  status_code INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys(expires_at);
```

- TTL = 24 ساعة.
- يُفحص في بداية كل mutating endpoint يحمل header `Idempotency-Key`.
- الـ header إلزامي على: `POST /api/orders/[id]/cancel`، `POST /api/orders/[id]/collect`، `POST /api/settlements`، `POST /api/distributions`.
- يُفحص أيضاً على: `POST /api/orders`، `POST /api/payments` (اختياري، يُستخدم من UI لمنع double-submit).
- إذا الـ key موجود: يُعاد الـ response السابق مباشرة (لا re-execution).
- تنظيف expired rows ضمن `/api/cron/daily`.

**السبب**: `29_Concurrency.md` كانت تفرض `Idempotency-Key` لكن بلا تخزين. إعادة إرسال الشبكة كانت ستُنتج دفعات مكرَّرة.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md`، `29_Concurrency.md`، `35_API_Endpoints.md`، `31_Error_Handling.md`.

---

### D-17 — commission_rule_snapshot في order_items

**القرار**: يُضاف عمود `order_items.commission_rule_snapshot JSONB NOT NULL DEFAULT '{}'` يحفظ قيم قواعد العمولة المُطبَّقة لحظة إنشاء الـ order_item:

```json
{
  "source": "user_override | category_rule | default",
  "seller_fixed_per_unit": 10,
  "seller_pct_overage": 40,
  "driver_fixed_per_delivery": 10,
  "captured_at": "2026-04-19T10:30:00+02:00"
}
```

- عند حساب `calculateBonusInTx` عند تأكيد التسليم، تُستخدم القيم من الـ snapshot (ليس من settings/rules الحالية).

**السبب**: إذا غيَّر PM قاعدة عمولة بين إنشاء الطلب والتسليم، البائع سيفاجأ بنتيجة مختلفة. Snapshot يحمي الحقوق المكتسبة.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md`، `13_Commission_Rules.md`، `10_Calculation_Formulas.md`.

---

### D-18 — مواءمة C1 "لا قيم افتراضية" مع BR-18 الاستثناء

**القرار**: شاشة C1 (`cancellations` insert):

- `return_to_stock`: **إلزامي دائماً**، لا افتراضي.
- `seller_bonus_action`:
  - إذا يوجد صف bonus بـ `role='seller'` لطلب الـ order_id → **إلزامي**، لا افتراضي.
  - إذا لا يوجد → القيمة المخزَّنة `'cancel_unpaid'` تلقائياً (UI يعرضها معطَّلة مع ملاحظة "لا عمولة").
- `driver_bonus_action`: نفس منطق seller_bonus_action مع `role='driver'`.

**السبب**: "لا قيم افتراضية" (C1 النصي) تناقض "`cancel_unpaid` افتراضياً عند غياب العمولة" (BR-18). الحل: الافتراضي **موجود**، لكنه فقط عندما الخيار غير ذي معنى.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `09_Business_Rules.md` BR-18، `19_Forms_Fields.md`، `14_components`-equivalent في `18_Screens_Pages.md`.

---

### D-19 — سياسة retention مُقسَّمة

**القرار**:

| الجدول | Retention |
|--------|-----------|
| `activity_log` | 90 يوم (cron يحذف) |
| `voice_logs` | 30 يوم (cron يحذف) |
| `notifications` (read) | 60 يوم (cron يحذف) |
| `idempotency_keys` (expired) | فور انتهاء TTL (cron يحذف) |
| الجداول المالية (orders, order_items, payments, invoices, bonuses, settlements, treasury_movements, profit_distributions, cancellations, purchases, supplier_payments, expenses) | **لا حذف أبداً** — soft-delete فقط |
| جداول مرجعية (clients, suppliers, products, users) | **لا حذف** — تعطيل فقط (`active=false`) |

**السبب**:
- المحاسبة الخارجية تتكفَّل بـ legal retention للسجلات المحاسبية (10 سنوات عبر pièces justificatives).
- المشروع يحتفظ بالبيانات الأصلية (orders, payments, …) للأبد للحفاظ على business truth ومرجعية داخلية للاستفسارات.
- السجلات التشغيلية فقط (activity_log, voice_logs, notifications) خاضعة لـ cleanup.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `27_Audit_Log.md`، `36_Performance.md`، `37_Backup_Protection.md`، `06_Reference_Data.md`.

---

### D-20 — FK IDs كمصدر truth، الأسماء denormalized cache

**القرار**: يُضاف:

- `orders.client_id INTEGER NOT NULL FK RESTRICT → clients.id`
- `orders.client_name_cached TEXT NOT NULL` (اسم العميل لحظة الإنشاء، ليس for query — للعرض التاريخي فقط).
- `order_items.product_id INTEGER NOT NULL FK RESTRICT → products.id`
- `order_items.product_name_cached TEXT NOT NULL`
- `deliveries.client_id INTEGER NOT NULL FK RESTRICT → clients.id`
- `deliveries.client_name_cached TEXT NOT NULL`
- `purchases.supplier_id INTEGER NOT NULL FK RESTRICT → suppliers.id`
- `purchases.supplier_name_cached TEXT NOT NULL`
- `price_history.product_id FK RESTRICT`
- `bonuses.user_id INTEGER NOT NULL FK RESTRICT → users.id`
- `cancellations.cancelled_by_id FK RESTRICT → users.id`

**سلوك عند تغيير اسم الكيان الأصلي**:
- لا تحديث للأعمدة `*_name_cached` في الجداول التابعة. السجلات التاريخية تعرض الاسم القديم (الصحيح محاسبياً — الفاتورة الصادرة باسم قديم تظل بذلك الاسم).
- UI يفضِّل قراءة `*_name_cached` لعرض السجل كما كان.
- عند البحث/الفلترة، يُستخدم JOIN على `*_id` لإظهار الاسم الحالي في الـ dashboards الحية.

**السبب**:
- الحل القديم (تحديث ذري عبر 6+ جداول) هشّ.
- FK + cached name = سلامة مرجعية + سرعة عرض + صحة محاسبية للسجلات التاريخية.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md`، `30_Data_Integrity.md`، `10_Calculation_Formulas.md` (JOINs المحدَّثة).

---

### D-21 — CHECK على driver_tasks.related_entity_type

**القرار**: عمود `driver_tasks.related_entity_type` يحمل CHECK:

```sql
CHECK (related_entity_type IN ('order', 'supplier_purchase', 'client_collection', 'other'))
```

**السبب**: السابق نص حر — أول خطأ إملائي = بيانات متسخة بلا تنبيه.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md`.

---

### D-22 — notification_preferences.channel مقيَّد لـ in_app

**القرار**: `notification_preferences.channel` CHECK يُقيَّد على قيمة واحدة:

```sql
CHECK (channel IN ('in_app'))
```

- Email/push يُحذَفان من القائمة للـ MVP.
- العمود يبقى للتوسعة المستقبلية (إذا أُضيف SMTP أو Web Push).

**السبب**:
- لا SMTP service في stack.
- Web Push مرفوض في `DEVELOPMENT_PLAN.md` بسبب تعقيد iOS.
- قيم ميتة في CHECK = ديون تقنية من اليوم الأول.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md`، `26_Notifications.md`.

---

### D-23 — دمج Cron jobs إلى 2

**القرار**: Vercel Hobby يسمح بـ 2 cron jobs لكل مشروع. يُدمَجان:

**`/api/cron/daily`** (03:00 Europe/Paris):
- cleanup `activity_log` > 90 يوم.
- cleanup `voice_logs` > 30 يوم.
- cleanup `notifications` المقروءة > 60 يوم.
- cleanup `idempotency_keys` expired.
- تذكير daily reconciliation للـ managers/GM.
- فحص + قلب `payment_schedule.status` إلى `overdue` للدفعات المتأخرة.
- cleanup لصور Vercel Blob اليتيمة (products.active=false و delete_at > 30 يوم).

**`/api/cron/hourly`** (كل ساعة):
- pruning لـ voice rate-limit cache في Neon.
- dispatch للإشعارات المؤجَّلة.

- كل endpoint محمي بـ `Authorization: Bearer ${CRON_SECRET}`.

**السبب**: الخطة كانت تحتاج 3-4 cron jobs. Hobby يحدّ بـ 2. الدمج يحافظ على الوظائف بدون ترقية plan.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `33_Integrations.md`، `DEVELOPMENT_PLAN.md` Phase 6.

---

### D-24 — كلمة مرور admin الافتراضية = عشوائية

**القرار**: عند `/api/init` لأول مرة، النظام يُولِّد كلمة مرور عشوائية (24 حرف) ويطبعها مرة واحدة في stdout:

```
=================================================
  ADMIN PASSWORD (save this — shown only once):
  Xk7@mP2qR9!vN3wL&yF8zC1t
=================================================
```

- تُخزَّن مُشفَّرة بـ **Argon2id** في `users.password` (نُقِّح عبر D-40).
- لا قيمة افتراضية hardcoded (`admin123` مرفوضة).
- المستخدم مطالَب بتغييرها فوراً بعد أول دخول (UI يُجبره).

**السبب**: admin/admin123 كان security hole حقيقي في v1. العشوائية الإلزامية تحمي من deployment بلا تغيير.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `17_Security_Requirements.md`، `35_API_Endpoints.md` `/api/init`.

---

### D-25 — حدود Vercel Blob والصور

**القرار**: قيود صارمة لضمان البقاء ضمن 500 MB:

- **حد أقصى للمنتجات**: `settings.sku_limit = 500` (Zod يرفض إنشاء منتج جديد إذا `COUNT(products WHERE active=true) >= 500`).
- **حد أقصى للصور لكل منتج**: 3 صور (schema + UI enforcement).
- **Client-side compression**: عبر `browser-image-compression` قبل الرفع، الهدف 300 KB.
- **Blob cleanup**: `/api/cron/daily` يحذف Blob files للمنتجات `active=false AND deleted_at > 30 يوم`.
- **Orphan cleanup**: نفس الـ cron يحذف Blob files غير مربوطة بصف في `product_images`.

**حسابات**: 500 منتج × 3 صور × 300 KB = ~450 MB (ضمن الحد). + PDFs كاتالوج = ~30-50 MB.

**السبب**: الحسابات السابقة (1600 صورة × 300 KB = 480 MB) كانت هشّة ولم تشمل orphan/catalog.

**التاريخ**: 2026-04-19.

**الملفات المتأثرة**: `02_DB_Tree.md` (sku_limit في settings)، `06_Reference_Data.md`، `33_Integrations.md`، `20_Validation_Rules.md` (Zod على products)، `DEVELOPMENT_PLAN.md` Phase 2.

---

# قرارات الجولة السادسة (لجنة سبعة خبراء) — D-26..D-65

**المصدر**: [../audit-reports/06_comprehensive_expert_review.md](../audit-reports/06_comprehensive_expert_review.md)
**التاريخ**: 2026-04-19
**الحالة**: موثَّقة — التطبيق على specs دفعات حسب الأولوية (Critical أولاً قبل Phase 0).

---

## الفئة A — Schema & Database (D-26..D-30)

### D-26 — WebSocket Pool Lifecycle

**القرار**: `src/db/client.ts` يعرِّف Pool مُخصَّص per-invocation:
```ts
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,                      // واحد كافٍ للـ serverless
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 5000,
});
```
في كل route/middleware يستخدم Pool، إضافة `ctx.waitUntil(pool.end())` في `finally` لضمان إغلاق WebSocket بعد الـ response. HTTP driver (`neon()`) يُستخدم للقراءات one-shot (لا transaction).

**السبب**: Neon Free `max_connections=100`. Serverless بلا `pool.end()` يُراكم WebSockets معلَّقة. 20 user × polling يستنزف 190h/شهر في أسابيع.

**التاريخ**: 2026-04-19.

### D-27 — No CASCADE on Soft-Delete Tables

**القرار**: كل FK على جدول يحمل `deleted_at` = `ON DELETE RESTRICT`. CASCADE-in-tx يدوي داخل `withTx` (مثلاً: soft-delete order → UPDATE order_items.deleted_at manually).

**الجداول المُعدَّلة**:
- `order_items.order_id` → RESTRICT (كان CASCADE)
- `product_images.product_id` → RESTRICT (CASCADE كان لكن products لا تُحذف أبداً)
- `notifications.user_id` → RESTRICT
- `user_bonus_rates.username` → RESTRICT
- `profit_distributions.group_id` → RESTRICT
- استثناء موثَّق وحيد: **لا استثناءات** — كل FK RESTRICT.

**السبب**: CASCADE لا يُطلَق على UPDATE، فلا قيمة له مع soft-delete. مخاطرة: DELETE مباشر من console يُفَرِّغ البيانات المالية.

**التاريخ**: 2026-04-19.

### D-28 — settings.key ENUM + Zod Typing

**القرار**:
1. `settings.key` CHECK constraint:
   ```sql
   CHECK (key IN (
     'shop_name', 'shop_legal_form', 'shop_siren', 'shop_siret', 'shop_ape',
     'shop_vat_number', 'shop_address', 'shop_city', 'shop_email', 'shop_website',
     'shop_iban', 'shop_bic', 'shop_capital_social', 'shop_rcs_city',
     'shop_rcs_number', 'shop_penalty_rate_annual', 'shop_recovery_fee_eur',
     'vat_rate', 'invoice_currency',
     'seller_bonus_fixed', 'seller_bonus_percentage', 'driver_bonus_fixed',
     'max_discount_seller_pct', 'max_discount_manager_pct',
     'vin_required_categories', 'driver_custody_cap_eur',
     'sku_limit', 'max_images_per_product',
     'voice_rate_limit_per_min', 'voice_max_audio_seconds', 'voice_min_audio_ms',
     'auto_refresh_interval_ms',
     'activity_log_retention_days', 'voice_logs_retention_days',
     'read_notifications_retention_days'
   ))
   ```
2. `src/lib/settings.ts` يُعرِّف `SettingsSchema` Zod + helper `getSettings(): Promise<Settings>` typed مع cache TTL 60s.

**السبب**: `parseInt(await getSetting('sku_limit'))` يُعيد NaN صامت عند خطأ. لا typing = نقطة فشل صامتة في 30+ مسار.

**التاريخ**: 2026-04-19.

### D-29 — bonuses.order_item_id NULLABLE + UNIQUE Split

**القرار**:
```sql
ALTER TABLE bonuses ALTER COLUMN order_item_id DROP NOT NULL;

CREATE UNIQUE INDEX bonuses_seller_unique ON bonuses (delivery_id, order_item_id, role)
  WHERE role = 'seller' AND deleted_at IS NULL;

CREATE UNIQUE INDEX bonuses_driver_unique ON bonuses (delivery_id, role)
  WHERE role = 'driver' AND deleted_at IS NULL;
```

**السبب**: عمولة السائق واحدة لكل توصيل (بلا ربط order_item محدد). `NOT NULL + UNIQUE(delivery_id, role, order_item_id)` كانا يتناقضان مع spec الـ commission.

**التاريخ**: 2026-04-19.

### D-30 — Invoice Lines Snapshot (Legal Compliance)

**القرار**: **يعدِّل D-02 جزئياً**. TVA لا تُخزَّن لكن **أصناف + totals مُجمَّدة** لحظة `POST /api/invoices`:

```sql
CREATE TABLE invoice_lines (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  product_name_frozen TEXT NOT NULL,
  quantity NUMERIC(19,2) NOT NULL,
  unit_price_ttc_frozen NUMERIC(19,2) NOT NULL,
  line_total_ttc_frozen NUMERIC(19,2) NOT NULL,
  vat_rate_frozen NUMERIC(5,2) NOT NULL,
  vat_amount_frozen NUMERIC(19,2) NOT NULL,
  ht_amount_frozen NUMERIC(19,2) NOT NULL,
  is_gift BOOLEAN DEFAULT false
);

ALTER TABLE invoices ADD COLUMN total_ttc_frozen NUMERIC(19,2),
                     ADD COLUMN total_ht_frozen NUMERIC(19,2),
                     ADD COLUMN tva_amount_frozen NUMERIC(19,2),
                     ADD COLUMN vat_rate_frozen NUMERIC(5,2);
```

PDF rendering يقرأ **فقط** من frozen columns و `invoice_lines` — ليس من `order_items`.

**السبب**: Loi anti-fraude TVA 2018 + CGI art. 289 — إلزام inaltérabilité. D-02 يظل صحيحاً لحظة ما قبل الإصدار، لكن بعد `status='مؤكد'` Fatura مُجمَّدة.

**مرجع قانوني**: CGI art. 289 ; BOFiP BOI-TVA-DECLA-30-20-10-10 §50 ; loi 2015-1785 art. 88.

**التاريخ**: 2026-04-19.

---

## الفئة B — Voice & AI (D-31..D-34)

### D-31 — Voice Groq tool_use

**القرار**: استبدال `response_format: { type: 'json_object' }` بـ:
```ts
const response = await groq.chat.completions.create({
  model: 'llama-3.1-8b-instant',
  messages: [...],
  tools: [{
    type: 'function',
    function: {
      name: 'extract_transaction',
      description: 'Extract sale/purchase/expense from Arabic speech',
      parameters: { /* JSON Schema with required fields per action */ }
    }
  }],
  tool_choice: { type: 'function', function: { name: 'extract_transaction' } }
});
const extracted = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
```

**السبب**: JSON mode لا يُلزم schema → 80-85% structural validity. `tool_use` يُلزم على مستوى decoder → 97%.

**التاريخ**: 2026-04-19.

### D-32 — Entity Resolver freqBoost Capped + Decay

**القرار**:
```ts
freqBoost = Math.min(0.15, Math.log10(frequency + 1) * 0.05);
```
+ cron daily: `UPDATE entity_aliases SET frequency = FLOOR(frequency * 0.98)` لمنع bias قديم.

**السبب**: frequency غير مسقَّف → alias متكرر 1000 مرة يتغلَّب على Fuse+JW حتى بلا تطابق.

**التاريخ**: 2026-04-19.

### D-33 — Rate Limiter Hybrid ⚠️ SUPERSEDED بواسطة D-73

**القرار الأصلي (مُلغى)**: In-memory sliding window per-instance + flush إلى `voice_rate_limits` كل 30s.

**سبب الإلغاء**:
- Vercel serverless = **stateless per invocation**. in-memory per-instance يعني كل cold-start = نافذة جديدة فارغة.
- نتيجة حسابية: في ذروة الطلب قد تُنشأ 5-10 instances متوازية، كل منها يقبل 10/min → 50-100 requests/min فعلياً (بدل 10). الحماية شبه منعدمة.
- D-33 كان يُقدِّر cold-start "مرة كل 30s" — خاطئ في Vercel Hobby حيث cold-start يحدث كل invocation تقريباً في ساعات الذروة.
- تناقض داخلي: [17_Security_Requirements.md:50](../requirements-analysis/17_Security_Requirements.md#L50) و [34_Technical_Notes.md:41](../requirements-analysis/34_Technical_Notes.md#L41) كانا يقولان DB-only، بينما D-33 + [32_Voice_System.md:36](../requirements-analysis/32_Voice_System.md#L36) يقولان hybrid.

**الاستبدال**: انظر **D-73** أسفل.

**التاريخ**: 2026-04-19 (طُرح)، 2026-04-19 (أُلغي بنفس اليوم عبر D-73).

### D-34 — Entity Resolver DB Cache TTL 60s

**القرار**: `src/modules/voice/entity-cache.ts` يحتفظ بـ products/clients/suppliers في module-level Map مع TTL 60s. Invalidation hook على mutations (`onProductChange`, `onClientChange`).

**السبب**: كل voice request = 5 DB queries بالتوازي + Whisper + LLM. Caching يوفِّر ~60% queries في الذروة.

**التاريخ**: 2026-04-19.

---

## الفئة C — Legal & Compliance (D-35..D-40)

### D-35 — Invoice Mandatory Mentions Complete Set

**القرار**: الفاتورة تحتوي **كل** الـ mentions إلزامية:

| Mention | المصدر |
|---------|--------|
| Raison sociale (VITESSE ECO SAS) | settings.shop_name + shop_legal_form |
| Adresse + code postal + ville | settings.shop_address + shop_city |
| SIRET | settings.shop_siret |
| RCS + ville | **جديد**: settings.shop_rcs_number |
| APE | settings.shop_ape |
| Capital social | **جديد**: settings.shop_capital_social |
| N° TVA intracommunautaire | settings.shop_vat_number |
| Numéro de facture | FAC-YYYY-MM-NNNN (D-01) |
| Date de facturation | invoice.date |
| Date de livraison | **جديد**: orders.delivery_date DATE (يُعبَّأ عند status='مؤكد') |
| Désignation, Qté, Prix HT, Total HT, TVA%, TVA, TTC | invoice_lines (D-30) |
| Conditions d'escompte | **جديد**: nouveau champ settings أو قالب |
| Pénalités de retard + indemnité 40€ | **جديد**: settings.shop_penalty_rate_annual + shop_recovery_fee_eur |

**السبب**: CGI art. 242 nonies A + C. com art. L441-9/R123-238/D441-5. Amende 15€/mention/facture × 4 mentions × 100 فواتير = 6000€/سنة.

**الملفات المتأثرة**: `06_Reference_Data.md` (settings)، `22_Print_Export.md` (قالب الفاتورة)، `02_DB_Tree.md` (orders.delivery_date).

**التاريخ**: 2026-04-19.

### D-36 — FEC Delegation Letter

**القرار**: **خيار B**: توثيق صريح في `12_Accounting_Rules.md` أن النظام "pas un système de tenue de comptabilité". المحاسبة الخارجية (expert-comptable) هي المسؤولة عن:
- Journal comptable
- Grand-livre
- FEC (Fichier des Écritures Comptables)

النظام يُصدِّر **CSV شهري** (payments + invoices + expenses + treasury_movements) تُسلَّم للـ expert-comptable. خطاب تعهُّد موقَّع من الـ expert-comptable يُحفَظ في `docs/compliance/fec_delegation.md`.

**السبب**: CGI art. L47 A-I + décret 2013-346 يفرض FEC. خيار "يصدر بنفسه" معقَّد، خيار "يُحال لـ expert" مقبول بتوثيق.

**التاريخ**: 2026-04-19.

### D-37 — Hash Chain + Attestation Éditeur

**القرار**:
1. hash chain على جداول `invoices`, `invoice_lines`, `cancellations`, `activity_log`:
   ```sql
   ALTER TABLE invoices ADD COLUMN prev_hash TEXT, ADD COLUMN row_hash TEXT NOT NULL;
   -- trigger BEFORE INSERT يحسب:
   -- row_hash = encode(sha256(convert_to(prev_hash||data_canonical, 'UTF8')), 'hex')
   ```
2. Attestation éditeur (نموذج DGFiP) تُوقَّع من المالك/المطوِّر وتُحفَظ في `docs/compliance/attestation_editeur.md`. تؤكِّد 4 critères:
   - **Inaltérabilité**: hash chain + REVOKE DELETE (D-04).
   - **Sécurisation**: SSL + Argon2id (D-40) + PII masking.
   - **Conservation**: 10 سنوات soft-delete.
   - **Archivage**: automated backups (D-43).

**السبب**: Loi anti-fraude TVA 2018 (art. 286-I-3° bis CGI). B2C espèces = obligation. Amende 7500€ non-conformité.

**التاريخ**: 2026-04-19.

### D-38 — Avoir Structure Formal

**القرار**:
```sql
ALTER TABLE invoices ADD COLUMN avoir_of_id INTEGER NULL REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT avoir_negative_total CHECK (
  (avoir_of_id IS NULL) OR (total_ttc_frozen < 0)
);
```

Avoir له أصنافه الخاصة في `invoice_lines` مع `quantity` سالبة. ترقيم نفس `FAC-YYYY-MM-NNNN` (تسلسل موحَّد)، لكن PDF يعرض "AVOIR" bold بدل "FACTURE" عند `avoir_of_id IS NOT NULL`.

**السبب**: CGI art. 272-1 — Avoir يجب أن يشير للفاتورة الأصلية + يحمل جميع mentions. Total سالب + quantity سالب per line = يسمح Avoir جزئي.

**التاريخ**: 2026-04-19.

### D-39 — Registre des Traitements (GDPR Art. 30)

**القرار**: ملف جديد `docs/compliance/registre_traitements.md` يوثِّق 4 معالجات:
1. **Traitement 1**: Clients (orders/deliveries/payments) — base légale: exécution contrat.
2. **Traitement 2**: Users (authentication/permissions) — base: exécution contrat emploi.
3. **Traitement 3**: Voice logs (ai_corrections/ai_patterns) — base: intérêt légitime.
4. **Traitement 4**: Activity log — base: obligation légale (audit/fiscal).

كل traitement: finalité، catégories, durée de conservation, destinataires, transferts hors UE.

**السبب**: RGPD art. 30. SAS < 250 موظف معفاة إلا عند processing "non occasionnel" — Vitesse Eco = وjess regular processing → إلزامي.

**التاريخ**: 2026-04-19.

### D-40 — Argon2id أو bcrypt 14

**القرار**: `src/lib/password.ts` يستخدم **Argon2id** عبر `@node-rs/argon2` (native، سريع، آمن):
```ts
import { hash, verify } from '@node-rs/argon2';
const options = { memoryCost: 65536, timeCost: 3, parallelism: 4 }; // m=64MB, t=3, p=4
```
إذا native binding لا يعمل على Vercel: fallback إلى **bcrypt 14 rounds**.

**السبب**: CNIL délibération 2022-100 + ANSSI 2023 — bcrypt 12 rounds "faible" بـ GPUs الحديثة. Argon2id الحد الأدنى الموصى به.

**التاريخ**: 2026-04-19.

---

## الفئة D — Infrastructure & Security (D-41..D-45)

### D-41 — حذف SSE Feature Flag كلياً

**القرار**: إزالة `FEATURE_SSE=true|false` من كل docs. Endpoint `/api/notifications/stream` **يُحذَف** من `35_API_Endpoints.md`. Polling هو الحل الوحيد. عند الحاجة لـ push مستقبلاً، يُقيَّم Ably/Pusher free-tier كمكوِّن مستقل.

**السبب**: Neon HTTP driver لا يدعم LISTEN/NOTIFY. WebSocket Pool + function timeout 300s يقطع SSE كل 5 دقائق. "Flag ready" كان ادعاء بلا تصميم.

**التاريخ**: 2026-04-19.

### D-42 — Polling Cadence Economy

**القرار**:
- **Notifications**: **on-demand only** عند فتح Bell Dropdown. badge count يأتي من `X-Unread-Count` header في أي response عادي.
- **DataTables**: 90s افتراضي، يُضاعَف إلى 180s بعد 3 دقائق idle.
- **`/api/cron/hourly`** يسجِّل Neon compute hours في `settings.neon_hours_used_this_month` للمراقبة.

**السبب**: Notifications polling 20s × 20 user = 200h/أسبوع > حصة Neon 190h/شهر.

**التاريخ**: 2026-04-19.

### D-43 — Automated Backups

**القرار**:
1. `/api/cron/daily` weekly (Sunday) ينفِّذ `pg_dump` مضغوط + مشفَّر → Vercel Blob (`backups/{YYYY-WW}.dump.gz.enc`).
2. شهري: مسؤولية PM يدوية لتحميل النسخة الأسبوعية ووضعها في Google Drive (خارج Vercel/Neon).
3. retention policy على Blob: احتفاظ بآخر 12 نسخة أسبوعية.

**السبب**: Neon Free PITR = 7 أيام فقط. فقد الحساب = كارثة. C. com art. L123-22 = 10 سنوات حفظ.

**التاريخ**: 2026-04-19.

### D-44 — Driver Custody Cap Hard-Enforcement

**القرار**: `/api/orders/[id]/collect` و `/api/clients/[id]/collect` middleware يفحص:
```ts
if (driver.role === 'driver' && driver_custody.balance + newAmount > settings.driver_custody_cap_eur) {
  throw new BusinessRuleError('تجاوز سقف العهدة. سلِّم الأموال لمديرك أولاً', 'CUSTODY_CAP_EXCEEDED', 409);
}
```
Override يدوي (PM فقط) عبر header `X-Force-Collect: true` مع activity_log.

**السبب**: سقف 2000€ موجود في settings لكن بلا enforcement = قيد اسمي.

**التاريخ**: 2026-04-19.

### D-45 — Session Idle 30m + Absolute 8h

**القرار**: Auth.js v5 config:
```ts
session: {
  strategy: 'jwt',
  maxAge: 8 * 60 * 60,        // 8h absolute
  updateAge: 30 * 60,          // refresh every 30min of activity
},
jwt: {
  maxAge: 8 * 60 * 60,
}
```
Frontend: idle detection (no mouse/keyboard 30 min) → auto logout مع warning modal 1 دقيقة قبل.

**السبب**: OWASP ASVS 4.0 §3.3.2 للتطبيقات المالية — idle <30m + absolute <12h.

**التاريخ**: 2026-04-19.

---

## الفئة E — UX & Accessibility (D-46..D-52)

### D-46 — شاشة C1 بوضعين Simple/Advanced

**القرار**: Dialog component يحمل state `mode: 'simple' | 'advanced'`:
- **simple** (default للـ seller + manager):
  - Preset: `return_to_stock=true, seller_bonus=cancel_unpaid, driver_bonus=cancel_unpaid`.
  - سؤال واحد فقط: reason.
  - زر "تخصيص" → يفتح advanced.
- **advanced** (default للـ pm + gm):
  - 3 radio groups كاملة.
  - Tooltip (i) بجانب كل خيار يشرح الأثر المالي.
- Preview panel قابل للطي يُظهر: refund amount، stock impact، bonus status.

**السبب**: 80% سيناريوهات seller = preset واحد. Decision paralysis مع 9 تركيبات.

**التاريخ**: 2026-04-19.

### D-47 — Voice `item` Field = SmartSelect

**القرار**: في `VoiceConfirm.tsx`، حقل `item` ليس `Input` نصي — بل `SmartSelect` مُحفَّز بالقيمة المستخرجة من LLM. يُظهر:
1. المنتجات المطابقة من catalog (عبر entity resolver نفسه).
2. عند كل منتج: `name_en` + `name_ar` إن وُجد.
3. زر "+ منتج جديد" في القائمة → يفتح `CreateProductDialog` مُباشرة.

**السبب**: قاعدة "item بالإنجليزية" تربك seller arabophone إذا Groq أخطأ.

**الملفات المتأثرة**: `19_Forms_Fields.md`، `32_Voice_System.md`.

**التاريخ**: 2026-04-19.

### D-48 — Empty States Catalog (per Page × Role)

**القرار**: ملف جديد `docs/requirements-analysis/38_Accessibility_UX_Conventions.md` يحوي قسم "Empty States Matrix" بـ 25 صفحة × 6 أدوار = جدول empty state لكل خلية. Component `<DataTable emptyState={...}>` إلزامي (ESLint rule).

**التاريخ**: 2026-04-19.

### D-49 — Onboarding Flow

**القرار**:
```sql
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ NULL;
```
- عند `onboarded_at IS NULL` في أول تسجيل دخول: Welcome modal يُعرض مع checklist (3-5 مهام role-specific).
- Tooltips سياقية (dismissible، يُحفَظ في localStorage).
- `/dashboard` لـ seller/driver يعرض "دليل سريع" قابل للطي.
- زر "إكمال الـ onboarding" → `UPDATE users SET onboarded_at=NOW()`.

**التاريخ**: 2026-04-19.

### D-50 — User-Friendly Error Messages

**القرار**: إعادة صياغة الأخطاء في `31_Error_Handling.md` بلغة المستخدم النهائي:
- `IDEMPOTENCY_KEY_CONFLICT` → "تم إرسال نفس الطلب مرتين. افتح الصفحة مجدداً وأعد المحاولة."
- `SKU_LIMIT_REACHED` → "وصلت الحد الأقصى للمنتجات النشطة. عطِّل منتجاً قبل إضافة جديد."
- `CRON_UNAUTHORIZED` → **لا تظهر أبداً للمستخدم** (server-only).
- `CUSTODY_CAP_EXCEEDED` → "تجاوزت السقف النقدي. سلِّم الأموال لمديرك أولاً."
Typed error class يحمل `developerMessage` (logs) و `userMessage` (UI).

**التاريخ**: 2026-04-19.

### D-51 — Accessibility Budget

**القرار**:
- Zero AA violations على `axe-core` في CI.
- Touch targets ≥ 44×44px.
- `aria-live` للـ toasts.
- Focus trap في Dialog.
- Keyboard-only paths مختبرة لـ: تسجيل دخول، إنشاء طلب، C1 cancel.
- Cairo contrast ratios موثَّقة في dark mode tokens.
- خريطة ARGAA 4.1 AA كاملة في ملف 38.

**التاريخ**: 2026-04-19.

### D-52 — Commission Preview for Seller

**القرار**: `order_items` row في form tsee عمود إضافي "عمولتي المتوقعة" لـ `role=seller` — محسوبة من `commission_rule_snapshot` فور إضافة الصف. إجمالي العمولة معروض في footer الـ form.

**السبب**: Motivation + transparency. D-17 snapshot محفوظ لكن seller لا يراه.

**التاريخ**: 2026-04-19.

---

## الفئة F — Miscellaneous (D-53..D-65)

### D-53 — Stale Commission Snapshot Mitigation

**القرار**: إذا `orders.created_at < NOW() - INTERVAL '60 days'`، عند `confirm` يُطبَّق `min(snapshot.rate, current.rate)`. إذا `> 90 days` → cron يرفع notification لـ PM للمراجعة اليدوية.

**السبب**: D-17 يحمي البائع لكن قد يُستَغلَّ.

### D-54 — Profit Distribution Non-Overlapping Periods

**القرار**: قبل INSERT في `profit_distribution_groups`، فحص:
```sql
SELECT COUNT(*) FROM profit_distribution_groups
WHERE base_period_start <= :new_end
  AND base_period_end >= :new_start
  AND deleted_at IS NULL;
```
إذا > 0 → 409 `OVERLAPPING_PERIOD`.

### D-55 — PDF Generation Outside Transaction

**القرار**: transaction 1: INSERT invoice + invoice_lines + increment counter (~50ms). **يتحرَّر**. Background job: generate PDF → UPDATE `invoices.pdf_url`.

### D-56 — Cairo Subset + Blob Cache

**القرار**: Cairo TTFs في PDF = subset مخصَّص (Latin + Arabic basic) عبر `fonttools pyftsubset` → `public/fonts/cairo/subset/`. PDF بعد أول render يُرفَع إلى Blob + TTL 30d.

### D-57 — idempotency UNIQUE (key, endpoint)

**القرار**:
```sql
ALTER TABLE idempotency_keys
  DROP CONSTRAINT idempotency_keys_pkey,
  ADD PRIMARY KEY (key, endpoint);
```
Lookup دائماً: `WHERE key=? AND endpoint=?`.

### D-58 — Immutability Triggers Raw SQL

**القرار**: migration `src/db/migrations/0001_immutable_audits.sql`:
```sql
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'row is immutable'; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER activity_log_no_update BEFORE UPDATE ON activity_log FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER cancellations_no_update BEFORE UPDATE ON cancellations FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER price_history_no_update BEFORE UPDATE ON price_history FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER treasury_movements_no_update BEFORE UPDATE ON treasury_movements FOR EACH ROW EXECUTE FUNCTION reject_mutation();
```

### D-59 — Middleware JWT-Only

**القرار**: `src/middleware.ts` يقرأ role من JWT token فقط (بلا DB). رخصة granular (`can(resource, action)`) في helpers داخل API routes، لا middleware.

### D-60 — Deterministic Blob Keys

**القرار**: Product images على Blob:
```
products/{product_id}/slot-{0|1|2}.webp   (overwrite in place)
invoices/{invoice_id}.pdf                  (TTL 30d)
catalog/{language}.pdf                     (overwrite)
```

### D-61 — Expense PCG Comptable Class

**القرار**: `expenses.comptable_class TEXT NULL` (e.g., '6037' لـ inventory_loss، '6251' للمصاريف المكتبية). CSV export للـ expert يحتوي الحقل.

### D-62 — Supplier Credit Rename

**القرار**: rename العمود إلى `suppliers.credit_due_from_supplier` (semantics أوضح: الشركة دائنة للمورد، أي المورد يدين لنا).

### D-63 — voice_logs.status Enum

**القرار**:
```sql
ALTER TABLE voice_logs ADD CONSTRAINT voice_logs_status_check
  CHECK (status IN ('pending', 'processed', 'saved', 'abandoned', 'edited_and_saved', 'groq_error'));
```
Client يُرسل PUT `/api/voice/cancel` عند إغلاق VoiceConfirm بلا حفظ.

### D-64 — Toast Duration Dynamic

**القرار**: `toast.duration = Math.max(3000, message.length * 50)` ms. Error toasts المهمة (مع `code`) persistent حتى `X` يدوي.

### D-65 — Mobile Order Form Stepper

**القرار**: `<768px`:
- 3 خطوات: (1) العميل (2) الأصناف (3) الدفع.
- Sticky footer مع Total حي + زر "حفظ".
- كل صف item يطوى إلى سطر ملخَّص بعد الإدخال.

`≥768px`: single-scroll كما هو.

---

## الفئة G — Developer Review #07 Resolutions (D-66..D-76)

القرارات التالية حُسمت عبر المراجعة السابعة (تقرير المطوِّر الخارجي + rebuttal). راجع `docs/audit-reports/07_developer_review_and_rebuttal.md` للسياق الكامل.

### D-66 — API Versioning `/api/v1/` للـ Business APIs فقط

**القرار**: كل **Business API endpoint** يبدأ بـ `/api/v1/` من اليوم الأول في Phase 0.

**النطاق**: Business APIs فقط — الموارد التشغيلية/المالية/التقارير:
- ✅ `/api/v1/orders`, `/api/v1/deliveries`, `/api/v1/invoices`, `/api/v1/payments`, `/api/v1/clients`, `/api/v1/suppliers`, `/api/v1/products`, `/api/v1/treasury/*`, `/api/v1/settlements`, `/api/v1/distributions`, `/api/v1/bonuses`, `/api/v1/notifications`, `/api/v1/activity`, `/api/v1/voice/*`, `/api/v1/lookups/*`, `/api/v1/me/*`.

**خارج النطاق (بدون versioning)**: internal/infrastructure endpoints:
- ❌ `/api/health` (probe)
- ❌ `/api/cron/daily`, `/api/cron/hourly`, `/api/cron/weekly` (internal scheduler — محمي بـ `CRON_SECRET`)
- ❌ `/api/auth/*` (Auth.js standard callbacks — لا نتحكم بشكلها)
- ❌ `/api/init`, `/api/backup/*` (dev/admin-only)

**السبب**: Android React يُطلَق لاحقاً (افتراض المطوِّر). تغيير URL بعد الإطلاق = breaking change. versioning من اليوم الأول = صفر تكلفة الآن، يُجنِّب إعادة كتابة كاملة لاحقاً.

**الملفات المتأثرة**: `35_API_Endpoints.md` (إعادة prefix لكل business endpoint)، `34_Technical_Notes.md` (routing convention)، `DEVELOPMENT_PLAN.md` (Phase 6 → Phase 0).

**التاريخ**: 2026-04-19.

---

### D-67 — SessionClaims Abstraction (web cookies + mobile bearer ready)

**القرار**: طبقة `src/lib/session-claims.ts` abstract تعزل منطق الـ auth عن آلية النقل:

```ts
// src/lib/session-claims.ts
export type SessionClaims = {
  userId: number;
  username: string;
  role: 'pm' | 'gm' | 'manager' | 'seller' | 'driver' | 'stock_keeper';
  name: string;
  // claims قابلة للتوسع: tenantId, deviceId, scope, إلخ.
};

// نقطة استخراج الـ claims الوحيدة للـ backend:
export async function getSessionClaims(request: Request): Promise<SessionClaims | null> {
  // Phase 0..5: web cookie via Auth.js
  const session = await auth();
  if (session?.user) return toClaims(session.user);

  // Phase 5+ (Android): bearer token في Authorization header
  // const token = request.headers.get('authorization')?.replace('Bearer ', '');
  // if (token) return verifyJwtAndExtractClaims(token);

  return null;
}
```

كل business route handler يستدعي `getSessionClaims(request)` — **لا يستدعي `auth()` مباشرة**. هذا يضمن:
- اليوم: Auth.js cookies تعمل طبيعياً.
- لاحقاً: إضافة bearer token branch بدون تعديل أي route.

**السبب**: الموبايل لا يستخدم cookies. ربط كل routes بـ `auth()` مباشرة = retrofit كارثي عند إضافة Android.

**الملفات المتأثرة**: `17_Security_Requirements.md`، `34_Technical_Notes.md`.

**التاريخ**: 2026-04-19.

---

### D-68 — Route Handlers = Canonical Business Interface (Server Actions = Thin Adapters Optional)

**القرار**:
1. **Route handlers** في `src/app/api/v1/**/route.ts` هي **الواجهة الكنسية الوحيدة** لمنطق الأعمال (mutations + queries).
2. **Server Actions** مسموحة **فقط** كـ thin adapters للـ web UI (مثل: form submission wrapper يستدعي route handler عبر fetch). **ممنوع** أن تحتوي Server Action على business logic أو DB access مباشر.
3. كل Server Action تُعرِّف route handler مُكافِئ له في `/api/v1/*`. Server Action = convenience فقط للـ web.

**Contract صارم**:
```ts
// ✅ مسموح — Server Action thin wrapper:
'use server';
export async function createOrderServerAction(input: CreateOrderInput) {
  return fetch('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { /* forward session cookie */ },
  }).then(r => r.json());
}

// ❌ ممنوع — business logic داخل Server Action:
'use server';
export async function createOrderServerAction(input: CreateOrderInput) {
  const claims = await getSessionClaims(...);
  return withTx(async (tx) => { /* DB writes... */ });
}
```

**السبب**: الموبايل يستهلك REST فقط. business logic داخل Server Actions = تكرار حتمي عند بناء Android. route handlers كواجهة كنسية تضمن consumer-agnosticism.

**الملفات المتأثرة**: `DEVELOPMENT_PLAN.md:24, 44` (Server Actions claim)، `17_Security_Requirements.md:132` (Forms)، `34_Technical_Notes.md`.

**التاريخ**: 2026-04-19.

---

### D-69 — طبقة DTO/ViewModel صريحة

**القرار**: كل domain module يُعرِّف DTO (Data Transfer Object) منفصلاً عن Drizzle schema:

```
src/modules/<domain>/
  schema.ts          ← Drizzle table definitions (DB shape)
  dto.ts             ← Zod schemas للـ API request/response (DTO shape)
  mappers.ts         ← dbRowToDto() + dtoToDbInsert()
  service.ts         ← business logic — يستقبل DTO، يُرجع DTO
```

**ممنوع**:
- إرجاع صف Drizzle مباشرة من route handler.
- استهلاك Drizzle type في React component.
- استخدام `db.select().from(orders)` في Server Action أو React component.

**السبب**:
- يفصل DB evolution عن API contract.
- يسمح بإضافة حقول (مثل `calculated_total`, `permissions_preview`) بدون تعديل schema.
- يحمي API من تسريب حقول داخلية (`password_hash`, `internal_notes`, إلخ).

**ملاحظة صدق**: هذا قرار **وقائي** — لا يوجد كود الآن، فلا يوجد "تسرُّب مُثبَت". القرار يحدد القاعدة قبل كتابة أول route handler.

**الملفات المتأثرة**: `34_Technical_Notes.md` (architecture section).

**التاريخ**: 2026-04-19.

---

### D-70 — Lockfile Mandatory (`package-lock.json` commit)

**القرار**: `package-lock.json` يُلتزم في git **من Phase 0 Step 1** (قبل أي `src/`).

**قرار Phase 0b السابق بحذفه = خاطئ**. الأسباب الأصلية (الانتظار حتى Phase 0 "لتجنُّب lockfile قديم") غير صحيحة عملياً:
- lockfile = **reproducibility guarantee**. بدونه `npm ci` لا يعمل → CI مكسور.
- lockfile مفقود = كل developer يحصل على dependency tree مختلف محتمل.
- إعادة توليده في Phase 0 تعني: الآن repo يدّعي أنه Next.js-ready بينما `npm install` يُنتج tree غير مُتحقَّق منه.

**التصحيح**:
- Phase 0 Step 1 الأول: `npm install` → يُولَّد `package-lock.json` → **commit فوراً** قبل أي `src/` file.
- CI يستخدم `npm ci` (strict — يفشل إذا `package-lock.json` لا يطابق `package.json`).
- تحديث dependencies = `npm install <pkg>` + commit كلا الملفين في نفس PR.

**ملاحظة صدق**: هذا يعكس قرار Phase 0b السابق. تسجيل الخطأ في `audit-reports/07_*`.

**الملفات المتأثرة**: `DEVELOPMENT_PLAN.md` (Phase 0 Step 1 + Phase 0b retrospective)، `00_execution_plan.md`.

**التاريخ**: 2026-04-19.

---

### D-71 — MVP Scope = Order-to-Cash Only

**القرار**: MVP v1 (Phases 0..3) يشمل **فقط**:

**Included in MVP**:
1. Auth + 6 roles + DB-driven permissions (Phase 1).
2. Clients + Products + Suppliers (minimal CRUD — Phase 2).
3. Orders (multi-item) + Order creation + Cancellation C1 (simple mode فقط للـ operational roles — Phase 3).
4. Preparation board (stock_keeper) (Phase 3).
5. Delivery + confirmation + collection (driver) (Phase 3).
6. Invoice generation (frozen snapshot — D-30) + PDF (Phase 3).
7. Treasury handover (driver → manager → GM) (Phase 3).
8. Role-specific **Action Hub** home (D-72).
9. Basic notifications (in-app, on-demand — D-42) (Phase 3).

**Deferred to post-MVP (Phases 4..6)**:
- ❌ Voice input (Phase 5) — مع re-evaluation أولاً.
- ❌ Dashboards الثقيلة (charts + widgets) — Phase 4.
- ❌ Permissions UI (interactive matrix) — Phase 6.
- ❌ Profit Distributions — Phase 6 (expert-comptable يتولاها حالياً).
- ❌ Activity log explorer page — Phase 4 (DB موجود، UI مُؤجَّل).
- ❌ Command Palette (Ctrl+K) — Phase 6 (polish).
- ❌ Onboarding modal المطوَّل (D-49) — يُخفَّف إلى tooltip واحد لكل دور.
- ❌ Advanced mode في C1 للـ operational roles — admin فقط.
- ❌ Reports dashboard + charts — Phase 4.
- ❌ Cancel mode advanced + 3-radio options للـ seller — simple mode فقط.

**السبب**: تقييم المطوِّر (64/100) كان عادلاً: النطاق واسع جداً. MVP ضيق = إطلاق أسرع + فرصة تعلُّم حقيقية قبل التوسع.

**الملفات المتأثرة**: `DEVELOPMENT_PLAN.md` (Phase roadmap)، `18_Screens_Pages.md` (MVP vs post-MVP markers)، `00_execution_plan.md`.

**التاريخ**: 2026-04-19.

---

### D-72 — Role Home = Action Hub للـ admin roles + preserve task-first للـ operational roles

**القرار**:
- **Operational roles (seller, driver, stock_keeper)**: home يُحافَظ كما هو (task-first already — راجع [03_Modules_List.md:166-168](../requirements-analysis/03_Modules_List.md#L166)):
  - seller → `/orders`
  - driver → `/driver-tasks`
  - stock_keeper → `/preparation`
- **Admin roles (pm, gm, manager)**: home يتحوَّل من `/dashboard` الثقيل إلى **Action Hub** خفيف:
  - قسم "الإجراءات المُلِحَّة" (pending approvals, reconciliation due, overdue payments).
  - قسم "آخر نشاط" (آخر 5 عمليات في فريقك).
  - قسم "حالة الفرق" (counts فقط: orders today, deliveries pending, low stock count).
  - **لا charts** في الصفحة الرئيسية.
  - زر "عرض الـ dashboard الكامل" → `/dashboard` (للـ deep analysis).

**السبب**: رد المطوِّر الثاني صحَّح ادعائي: operational roles مُعدَّلون task-first بالفعل. المشكلة الحقيقية محصورة في admin roles.

**الملفات المتأثرة**: `18_Screens_Pages.md` (home routes)، `25_Dashboard_Requirements.md` (تقسيم Action Hub vs Full Dashboard)، `03_Modules_List.md` (تأكيد).

**التاريخ**: 2026-04-19.

---

### D-73 — Voice Rate Limit = DB-only (يُلغي D-33)

**القرار**: Voice rate limiting يستخدم **جدول Neon `voice_rate_limits` فقط** — لا in-memory state، لا hybrid.

```ts
// src/modules/voice/rate-limit.ts
export async function checkAndRecordVoiceRate(userId: number): Promise<boolean> {
  return withTx(async (tx) => {
    const windowStart = new Date(Date.now() - 60_000);

    // 1. عدّ الـ requests في النافذة
    const [{ count }] = await tx.select({ count: sql`count(*)` })
      .from(voiceRateLimits)
      .where(and(
        eq(voiceRateLimits.userId, userId),
        gte(voiceRateLimits.createdAt, windowStart)
      ));

    if (Number(count) >= 10) return false;

    // 2. سجِّل الـ request الحالي
    await tx.insert(voiceRateLimits).values({ userId, createdAt: new Date() });
    return true;
  });
}
```

**السبب (يُلغي D-33)**:
- Vercel serverless stateless → in-memory عديم الجدوى.
- DB roundtrip ~120ms × 2 queries **كلفة مقبولة** قبل Whisper (الذي يستغرق 1500ms+ أصلاً). إضافة 0.25s على latency تراكمية = 16% overhead.
- hybrid كان يفترض "cold-start كل 30s" — خاطئ في Vercel Hobby.
- بساطة > micro-optimization: قرار واحد موثَّق + كل الـ instances تحترمه.

**Cleanup**: `/api/cron/hourly` يحذف صفوف `voice_rate_limits` أقدم من 90 ثانية.

**الملفات المتأثرة**:
- `32_Voice_System.md:36` (إعادة كتابة Rate limit section).
- `17_Security_Requirements.md:50` (يظل كما هو — كان صحيحاً).
- `34_Technical_Notes.md:41` (يظل كما هو).
- `02_DB_Tree.md` (جدول `voice_rate_limits` schema إذا لم يكن موجوداً).
- `00_DECISIONS.md` D-33 (مُعلَّم SUPERSEDED).

**التاريخ**: 2026-04-19.

---

### D-74 — Support Matrix رسمي

**القرار**: Support matrix محدَّد في `docs/requirements-analysis/34_Technical_Notes.md`:

**Tier 1 — Must work (اختبارات E2E إلزامية)**:
- Chrome 120+ (desktop Windows + macOS).
- Edge 120+ (desktop Windows).
- Chrome on Android 12+ (أحدث Android 10+ مقبول).

**Tier 2 — Should work (اختبارات smoke فقط)**:
- Safari 17+ (macOS + iOS 17+).
- Firefox 120+ (desktop).

**Tier 3 — Out of scope**:
- IE 11 / Edge Legacy.
- Samsung Internet (قد يعمل، لا يُضمَن).
- Chrome < 120 / Safari < 17.

**معايير القبول**:
- Tier 1: zero bugs في golden paths (login → create order → confirm → invoice).
- Tier 2: degraded UX مقبول (مثل: font fallback)، لكن لا crashes.

**Responsive breakpoints**:
- Mobile: 320-767px (هدف driver/seller على الموبايل).
- Tablet: 768-1023px.
- Desktop: 1024px+.

**السبب**: بدون support matrix، "does it work on Safari?" يظل سؤال بلا إجابة. تعريف المصفوفة = أساس اختبارات E2E + CI matrix (D-75).

**الملفات المتأثرة**: `34_Technical_Notes.md` (قسم جديد).

**التاريخ**: 2026-04-19.

---

### D-75 — CI Gates إلزامية

**القرار**: `.github/workflows/ci.yml` يُنشأ في **Phase 0 Step 1** (قبل أي feature). يحتوي الـ gates التالية، **كلها blocking**:

```yaml
# .github/workflows/ci.yml (blueprint — يُنشأ في Phase 0)
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: 'npm' }
      - run: npm ci                        # D-70 lockfile enforcement
      - run: npm run lint                  # ESLint
      - run: npm run typecheck             # tsc --noEmit
      - run: npm run test                  # Vitest unit + integration
      - run: npm run build                 # next build — يكشف errors قبل deploy
      - run: npm run db:migrate:check      # Drizzle migration drift check
      - run: npm run openapi:drift         # D-66 — OpenAPI schema vs route handlers drift
```

**معايير القبول**:
- ✅ كل PR يمر بالـ 7 gates.
- ✅ red CI = لا merge (branch protection على `main`).
- ✅ coverage threshold: 70% للـ business logic modules (`src/modules/*/service.ts`).

**exceptions**: Phase 0a + 0b الحاليتان لا تُشغِّلان CI (لا يوجد src). CI يُفعَّل في Phase 0 Step 1.

**السبب**: بدون CI، أي developer يمكنه push كود مكسور. تقييم المطوِّر 64/100 كان يُحدِّد هذا كخطر حاد.

**الملفات المتأثرة**: `.github/workflows/ci.yml` (يُنشأ في Phase 0)، `DEVELOPMENT_PLAN.md` (Phase 0 Step 1)، `34_Technical_Notes.md` (CI section).

**التاريخ**: 2026-04-19.

---

### D-76 — إزالة DELETE endpoints المتعارضة مع D-04

**القرار**: الـ endpoints التالية **تُحذَف** من `35_API_Endpoints.md`:
- ❌ `DELETE /api/suppliers` — يتناقض مع D-04 (soft-delete مطلق) + [30_Data_Integrity.md:28](../requirements-analysis/30_Data_Integrity.md#L28) (suppliers تُعطَّل، لا تُحذَف).
- ❌ `DELETE /api/expenses` — يتناقض مع D-04 + [30_Data_Integrity.md:24](../requirements-analysis/30_Data_Integrity.md#L24) (expenses ممنوعة الحذف).

**البديل**:
- **suppliers**: `PUT /api/v1/suppliers/[id]` مع `{ active: false }` → soft-disable.
- **expenses**: **لا حذف**. إذا صحيح أن المصروف خاطئ، إدراج مصروف معاكس بـ `amount` سالب + notes يشير للسبب. سجل audit كامل.

**Sweep كامل لـ 35_API_Endpoints.md ضد D-04**: كل method=DELETE يُراجَع:
- ✅ مسموح: DELETE على `user_bonus_rates` (override مرن، ليس مالي). DELETE على `product_images` (صور، ليست مالي). DELETE على `permissions` (config، ليس مالي).
- ❌ ممنوع على أي كيان مالي/تشغيلي/تدقيقي: orders, order_items, deliveries, invoices, payments, purchases, bonuses, settlements, distributions, treasury_movements, activity_log, cancellations, price_history, supplier_payments, expenses, suppliers, clients, products, inventory_counts, voice_logs (retention cron-only).

**ملاحظة قانونية**: soft-delete + RESTRICT FK = C. com art. L123-22 (10 سنوات حفظ) + CGI art. 286-I-3° bis (inaltérabilité).

**الملفات المتأثرة**: `35_API_Endpoints.md` (حذف DELETE على suppliers + expenses + sweep كامل).

**التاريخ**: 2026-04-19.

---

### D-77 — Phase Delivery Gate: Full Tests + Evidence Report لكل مرحلة

**القرار (CRITICAL — أعلاها أولوية تنفيذية)**:

قبل تسليم أي مرحلة برمجية (Phase 0..6)، **ثلاث مراحل إلزامية لا يُتجاوَز أي منها**:

1. **Full test suite run**: unit + integration + E2E (المناسبة لنطاق المرحلة).
2. **CI gates السبعة (D-75)**: lint + typecheck + test + build + migration check + OpenAPI drift + lockfile. كلها خضراء.
3. **تقرير تسليم كامل** في `docs/phase-reports/phase-{N}-delivery-report.md` يوضِّح بدقة:
   - file-by-file changes مع line numbers (قبل/بعد لكل ملف + السبب).
   - deliverables list مع clickable links.
   - نتائج الاختبارات: pass/fail counts + coverage % per module.
   - CI gates run link (GitHub Actions).
   - ما تأجَّل أو لم يُنجز (honest scope gap + where tracked).
   - prerequisites للمرحلة التالية.

**القالب الموحَّد**:
```markdown
# Phase {N} Delivery Report — {Scope Name}

> **التاريخ**: YYYY-MM-DD
> **المدة**: {actual} أيام (متوقَّع: {estimate})
> **CI Run**: [github.com/.../runs/{id}]({link})

## 1. ما أُنجِز (file-by-file)

### `src/modules/orders/service.ts` (جديد، 180 سطر)
- **قبل**: لا يوجد.
- **بعد**: service layer لـ orders domain (D-68 + D-69).
- **السبب**: business logic خارج route handlers.

### `src/app/api/v1/orders/route.ts` (جديد، 45 سطر)
- thin handler — parse DTO → call service → return DTO.

(تكرار لكل ملف مُعدَّل/جديد)

## 2. Deliverables

- [الطلبات متعددة الأصناف — endpoint POST](src/app/api/v1/orders/route.ts)
- [commission snapshot frozen على order_items](src/db/schema/orders.ts)
- [C1 simple mode dialog](src/components/dialogs/CancelDialog.tsx)
- ...

## 3. Test Results

| Category | Pass | Total | Coverage |
|----------|-----:|------:|---------:|
| Unit (business logic) | 48 | 48 | 82% |
| Integration (API) | 22 | 22 | 78% |
| E2E (golden paths) | 5 | 5 | N/A |
| **Total** | **75** | **75** | **80% avg** |

CI gates: **7/7 passing** — [link]({ci_link})

## 4. Known Gaps / Deferred

- Voice input: مؤجَّل لـ Phase 5 (D-71).
- Advanced mode في C1 للـ seller: مؤجَّل لـ admin-only (D-71).
- ...

## 5. Prerequisites for Phase {N+1}

- ✅ Database schema migrated.
- ✅ API contracts stable (OpenAPI v1.0).
- ⏳ انتظار تأكيد المستخدم للانتقال.
```

**السبب**: المراجعة الخارجية #07 كشفت 3 فجوات فاتت 6 مراجعات داخلية رغم ادعاء Claude المتكرر "مكتمل". الدرس: **الادعاء ≠ الإثبات**. كل phase delivery بلا evidence report = ادعاء كاذب محتمل.

**السلوك عند فشل اختبار**:
- المرحلة لا تُغلَق.
- يُصلَح الخطأ الجذري (لا skip test، لا `--force`).
- تُعاد الاختبارات كاملة.
- يُحدَّث التقرير بالنتيجة النهائية.
- لا `git push --no-verify`، لا `--skip-hooks`.

**تطبيق على Phase 0c بأثر رجعي**: [`docs/audit-reports/07_developer_review_and_rebuttal.md`](../audit-reports/07_developer_review_and_rebuttal.md) = نموذج تقرير إغلاق docs-only phase. Phases 0..6 ستتبع القالب أعلاه مع test results فعلية.

**الملفات المتأثرة**:
- `DEVELOPMENT_PLAN.md` (Phase Exit Criteria section موحَّد لكل مرحلة).
- `00_execution_plan.md` (Phase 0 Exit condition).
- `docs/phase-reports/` (مجلد جديد — يُنشأ عند تسليم Phase 0).

**ملاحظة**: D-77 هو **المبدأ العام** ("لا تسليم بلا إثبات"). المواصفة الكاملة لهذا المبدأ = **D-78** أدناه.

**التاريخ**: 2026-04-19.

---

### D-78 — Delivery Acceptance Framework (13-Gate Pack + 13-Section Report + Post-Deploy Monitoring + KPIs)

**القرار (CRITICAL — المواصفة التنفيذية الكاملة لـ D-77)**:

هذا القرار يُعرِّف بالضبط ما يعنيه "phase delivery مكتمل" بحيث لا مجال للتفسير. أي تسليم لا يستوفي **كل البنود** = مرفوض.

#### 1. Mandatory Test Pack — 13 Gate (يُوسِّع D-75)

الـ CI workflow في `.github/workflows/ci.yml` يُشغِّل **13 gate، كلها blocking**:

| # | Gate | أمر | Pass condition |
|---|------|-----|----------------|
| 1 | Lockfile check | `npm ci` | `package-lock.json` مُحدَّث إذا deps تغيَّرت |
| 2 | Lint | `npm run lint` | 0 errors |
| 3 | Typecheck | `npm run typecheck` (`tsc --noEmit`) | 0 TypeScript errors |
| 4 | Build | `npm run build` (`next build`) | production build ينجح |
| 5 | Unit tests | `npm run test:unit` | all pass، coverage ≥ 70% عام، ≥ 90% critical modules |
| 6 | Integration tests | `npm run test:integration` (Neon ephemeral branch) | all pass على test DB |
| 7 | API contract check | `npm run openapi:drift` | 0 undocumented drift vs `openapi.yaml` |
| 8 | Migration check | `npm run db:migrate:check` | migrations تُطبَّق على DB فارغة + upgrade path |
| 9 | Authorization tests | `npm run test:authz` | لا role يصل forbidden action (6 × resource × action matrix) |
| 10 | Regression pack | `npm run test:regression` | all critical flows (انظر §2 أدناه) pass |
| 11 | E2E smoke | `npm run test:e2e:smoke` (Playwright Chrome 120) | critical user paths pass |
| 12 | Performance smoke | `npm run test:perf` | p95 per endpoint ضمن budget (لا major regression) |
| 13 | Accessibility + logging smoke | `npm run test:a11y` + `npm run test:logs` | 0 new critical a11y issues + new endpoints تنتج logs/metrics متوقَّعة |

#### 2. Permanent Regression Pack (critical flows — يُعاد اختباره عند كل تسليم)

أيّاً كان نطاق التسليم، هذه المسارات **تُختبَر كلها** (gate 10):

- **Auth**: login, logout, session expiry (idle 30m + absolute 8h — D-45), role resolution.
- **Orders**: create multi-item, edit reserved, cancel C1 (simple mode), collect payment.
- **Delivery**: assignment, confirm, handover (driver → manager → GM).
- **Invoice**: generation (frozen snapshot — D-30), PDF render (Cairo subset — D-56), avoir (credit note — D-38).
- **Treasury**: transfer, reconcile daily, settlements.
- **Permissions**: enforcement على كل sensitive endpoint (23 endpoint business).
- **Idempotency**: on money-changing endpoints (`orders/cancel`, `orders/collect`, `clients/collect`, `settlements`, `distributions`, `payments`).
- **Snapshots**: invoice `*_frozen` + commission `commission_rule_snapshot` (D-17 + D-30).
- **Soft-delete / soft-disable**: `deleted_at` حركي + `active=false` configuration.
- **`/api/v1/*` backward compatibility**: DTO stability، error contract.
- **Android-readiness**: stable DTOs، لا cookie-only dependencies، SessionClaims abstraction (D-67).

#### 3. Scope-Based Tests (conditional — إضافة للـ permanent pack)

تُشغَّل إضافياً حسب ما تغيَّر:

| إذا تغيَّر | اختبارات إضافية |
|-----------|-------------------|
| Auth (`session-claims.ts`, `password.ts`) | session claims extraction + role checks + token/cookie behavior |
| API (route handlers, DTOs) | OpenAPI diff + backward compat + error contract |
| DB (schema, migrations) | migration up/down + seed/test data compatibility |
| Money logic (bonuses, invoices, treasury) | edge-case math + rounding (0.01€) + negative amounts + concurrency (FOR UPDATE) |
| UI | responsive breakpoints (D-74) + keyboard flow + empty/error states |
| Performance-sensitive | p95 before/after comparison |
| Voice | parser accuracy على sample set + rate limit (D-73) + failure behavior |

#### 4. Minimum Acceptance Thresholds — صفر tolerance

- ✅ 0 failing gates.
- ✅ 0 critical/high security issues (npm audit + security review).
- ✅ 0 broken critical flows.
- ✅ 0 undocumented API changes.
- ✅ 0 unauthorized access paths.
- ✅ Critical business modules (`orders/service`, `invoices/service`, `treasury/service`, `bonuses/service`, `distributions/service`): **branch coverage ≥ 90%**.
- ✅ General modules: coverage ≥ **70%**.
- ✅ لا production delivery بدون migration verification.
- ✅ لا قبول "works on my machine" — CI هو المصدر الوحيد للحكم.
- ✅ E2E إلزامي على core flow المُلامَس.

#### 5. Delivery Quality Report — 13 Section

يُحفَظ في `docs/phase-reports/phase-{N}-delivery-report.md` بهذه البنية **بالضبط**:

```markdown
# Phase {N} Delivery Report

## 1. Delivery ID
- Date: YYYY-MM-DD HH:mm (Europe/Paris)
- Branch: feature/...
- Commit SHA: {40-char sha}
- PR #: {number + link}

## 2. Scope
**What changed**: ...
**What did NOT change**: ... (explicit)

## 3. Business Impact
(user-visible changes per role)

## 4. Technical Impact
- Files changed: N (+X lines, -Y lines)
- Modules: list
- Endpoints: list (v1 paths)
- Migrations: list (with names)

## 5. Risk Level
**Level**: low | medium | high
**Reason**: ...

## 6. Tests Run
| Command | Result | Duration |
|---------|--------|----------|
| `npm ci` | ✅ | 42s |
| `npm run lint` | ✅ 0 errors | 8s |
| `npm run typecheck` | ✅ | 12s |
| `npm run build` | ✅ | 35s |
| `npm run test:unit` | ✅ 142/142 (coverage 92% critical, 78% general) | 18s |
| `npm run test:integration` | ✅ 38/38 | 45s |
| `npm run openapi:drift` | ✅ 0 drift | 3s |
| `npm run db:migrate:check` | ✅ | 12s |
| `npm run test:authz` | ✅ 54/54 | 22s |
| `npm run test:regression` | ✅ 28/28 critical flows | 3m |
| `npm run test:e2e:smoke` | ✅ 5/5 golden paths | 4m |
| `npm run test:perf` | ✅ p95 within budget | 2m |
| `npm run test:a11y` | ✅ 0 new issues | 1m |

**CI run**: [link to GitHub Actions]

## 7. Regression Coverage
- [✅] login/logout/session
- [✅] order create/edit/cancel/collect
- [✅] delivery assign/confirm/handover
- [✅] invoice generate/PDF/avoir
- [✅] treasury transfer/reconcile/settlements
- [✅] permissions enforcement
- [✅] idempotency
- [✅] snapshots (invoice + commission)
- [✅] soft-delete/soft-disable
- [✅] /api/v1/* backward compat
- [✅] Android-readiness (DTOs stable)

## 8. API Impact
- Endpoints added: `/api/v1/...`
- Endpoints changed: (DTO diff)
- Versioning impact: none | v1 extended | breaking (requires v2)

## 9. DB Impact
- Migrations: `0005_add_...sql` (up + down verified)
- Data risk: none | low | medium (explain)
- **Rollback note**: صريح — كيف نستعيد إذا فشلت migration.

## 10. Security Check
- Auth changes: none | (list)
- Permissions changes: none | (matrix diff)
- Secrets handling: N/A | (how)
- Destructive paths: N/A | (list + safeguards)

## 11. Performance Check
- Endpoints added/changed: p95 before/after
- Bundle size delta: +X KB
- Neon compute hours impact: +N hours/month estimate

## 12. Known Issues
- Accepted limitations: (honest, not hidden)
- Tracked elsewhere: (links to issues / next phase scope)

## 13. Decision
**Status**: ✅ ready | ⚠️ ready-with-conditions | ❌ not-ready
**Conditions** (if applicable): ...
**Reviewer**: {name}
**Approved by**: {user confirmation}
```

#### 6. Post-Delivery Monitoring Reports — T+1h و T+24h

**إلزامي** بعد كل production deploy. ملف `docs/phase-reports/phase-{N}-monitoring-{T+Xh}.md`:

```markdown
# Phase {N} Monitoring Report — T+{X}h

- Deployment time: YYYY-MM-DD HH:mm
- Commit SHA: {sha}
- Environment: production

## Metrics
- Error count (5xx): N
- Failed requests (4xx legitimate excluded): N
- p95 latency per changed endpoint:
  - `/api/v1/orders`: Xms (baseline: Yms) → Z% change
- Auth failures: N
- Unexpected permission denials (403 on expected-allowed): N
- DB errors / migration anomalies: N
- User-reported issues: list

## Decision
**Status**: ✅ stable | ⚠️ watch | ❌ rollback candidate
**Reason**: ...
**Action**: continue monitoring | escalate | rollback to {commit}
```

**جدولة**:
- T+1h: أول فحص سريع (spot issues mid-deploy).
- T+24h: تأكيد الاستقرار عبر يوم عمل كامل.

#### 7. KPIs Dashboard — متابعة مستمرة

يُحدَّث بعد كل تسليم في `docs/phase-reports/kpi-dashboard.md`:

| مؤشر | الهدف | الحالي |
|------|-------|--------|
| Delivery pass rate | > 90% | — |
| Build success rate | > 95% | — |
| Escaped bugs / delivery | → 0 | — |
| Rollback count | 0 أو نادر جداً | — |
| Critical flow regression count | 0 | — |
| Auth/permission incidents | 0 | — |
| p95 critical endpoints | ضمن budget | — |
| Test flakiness rate | منخفض جداً | — |
| Coverage business modules | > 70% عام / > 90% حرج | — |
| Time to detect production issue | سريع | — |
| Time to recover | سريع | — |

#### 8. Evidence Requirements — لا عبارات غامضة

**ممنوع** قبول "tested and works".
**مطلوب** في كل Delivery Quality Report:
- قائمة أوامر الاختبار الفعلية.
- pass/fail counts بدقة.
- screenshots أو recordings قصيرة للـ UI changes.
- API diff summary (output of `openapi:drift`).
- migration name + result.
- coverage delta (قبل/بعد).
- قائمة المسارات الحرجة المُلامَسة.
- rollback note صريحة.
- known-risk note صريحة.

#### 9. Enforcement Policy

```
No delivery is accepted unless the developer submits BOTH:
  (a) the test evidence (13-gate CI run + results).
  (b) the Delivery Quality Report (13-section).

No critical business flow may be changed without regression proof.
No API or DB change may be accepted without contract AND migration verification.
No production deployment without T+1h and T+24h monitoring reports.
```

**في حال الفشل**: التسليم يُرفَض؛ يُصلَح الخطأ؛ تُعاد دورة الاختبار كاملة؛ يُحدَّث التقرير؛ لا "امضِ مع الحدث".

**الملفات المتأثرة**:
- `34_Technical_Notes.md` § CI Gates (يُوسَّع من 7 إلى 13).
- `DEVELOPMENT_PLAN.md` § Phase Exit Criteria (يُشير إلى D-78 كمواصفة).
- `docs/phase-reports/README.md` (القوالب الكنسية).
- `.github/workflows/ci.yml` (يُنشأ في Phase 0 Step 2 بـ 13 gate).

**التاريخ**: 2026-04-19.

---

### D-79 — Idempotency Reservation Design (Phase 3.0)

**القرار**: `withIdempotencyRoute` wrapper بلا صفوف ناقصة ولا تعديل schema. السلوك:

```
1. إذا Idempotency-Key غائب:
   - routeConfig.requireHeader = 'required' → 400 IDEMPOTENCY_KEY_REQUIRED.
   - routeConfig.requireHeader = 'optional' → pass-through (بلا ضمان idempotency).
2. إذا الـheader موجود:
   a. SELECT pg_advisory_xact_lock(hashtext(key || '|' || endpoint))
      — يسلسل المتنافسين على نفس (key, endpoint) داخل نفس tx.
   b. SELECT * FROM idempotency_keys WHERE key=? AND endpoint=?
      - موجود + username != current → 409 IDEMPOTENCY_KEY_OWNER_MISMATCH
        (مستخدم آخر استخدم هذا المفتاح على نفس الـendpoint — مشبوه، احجب).
      - موجود + request_hash != current → 409 IDEMPOTENCY_KEY_MISMATCH.
      - موجود + كلاهما مطابق → أرجع { response, status_code } المخزَّن
        (لا re-execute، D-16).
      - غير موجود → شغّل handler للنهاية داخل نفس tx، احصل على (status, body)،
        INSERT صفاً كاملاً (كل NOT NULL fields معبَّأة)، ثم COMMIT.
   c. فشل handler → rollback كامل (بلا صف مُدرَج). Replay = تنفيذ جديد.
      السلوك الصحيح: طلب فاشل لا يُستنسخ كفاشل؛ العميل يعيد المحاولة.
```

**القيود الصارمة**:
- **`endpoint` يُخزَّن بصيغة كاملة** `"POST /api/v1/orders/[id]/cancel"` (method + path template)، لا path فقط. يُمنع الخلط بين POST وPUT على نفس المسار.
- **ممنوع أي side effect خارجي خارج DB tx داخل handler محمي بـ idempotency** — لا HTTP calls، لا Blob uploads، لا Slack/email، لا file writes. خلاف ذلك يكسر ضمان "لا تكرار" عند replay. إذا احتجت side effect خارجي، أخرجه من الـhandler وشغّله بعد COMMIT عبر آلية منفصلة (لا تحمل Idempotency-Key).
- **username ليس جزءاً من lookup key** (PK هو `(key, endpoint)` وفق D-57 + schema audit.ts line 39)؛ لكنه يُفحص بعد إيجاد الصف لكشف إساءة استخدام المفاتيح.
- **requireHeader** enum: `'required' | 'optional'` (لا قيمة ثالثة). GET/HEAD لا تستخدم الـwrapper أصلاً.

**السبب**: تصميم سابق بـ "reservation صف بـ status_code=null, response=null ثم update" يتعارض مع `NOT NULL` في schema؛ إما نعدّل schema (يُكسر D-04 المبدئي "schema قيود صارمة") أو نتجنب الصفوف الناقصة. الـadvisory lock + INSERT post-handler يحل التزامن بلا تسوية.

**الملفات المتأثرة**:
- `src/lib/idempotency.ts` (Phase 3.0 code).
- `35_API_Endpoints.md` § Idempotency (تضاف إشارة للـwrapper + requireHeader per-route).
- `29_Concurrency.md` § Idempotency-Key (يربط بـ D-79).
- `31_Error_Handling.md` (يُضيف `IDEMPOTENCY_KEY_REQUIRED` + `IDEMPOTENCY_KEY_OWNER_MISMATCH` + `IDEMPOTENCY_KEY_MISMATCH`).

**التاريخ**: 2026-04-20.

---

### D-80 — activity_log Hash-Chain Write Protocol

**القرار**: كل كتابة على `activity_log` تمر عبر `logActivity(tx, entry)` helper واحد، السلوك:

```
1. SELECT pg_advisory_xact_lock(ACTIVITY_LOG_CHAIN_KEY)
   — ثابت int مُعرَّف مرة واحدة في src/lib/activity-log.ts (مثلاً 1000001).
   — يقفل السلسلة كاملة بما فيها حالة "الجدول فارغ" (سباق أول إدراجين محلول).
2. SELECT row_hash FROM activity_log ORDER BY id DESC LIMIT 1
   — قد يرجع فارغاً → prev_hash = NULL للسطر الأول (schema audit.ts: prev_hash nullable).
3. row_hash = sha256(
       (prev_hash ?? '') + '|' +
       canonicalJSON({ action, entityType, entityId, userId, username, metadata }) + '|' +
       ISO_timestamp
    )
   — canonicalJSON = ترتيب مفاتيح أبجدي عميق؛ لا whitespace؛ لا trailing commas.
4. INSERT INTO activity_log (..., prev_hash, row_hash) VALUES (...).
5. الـlock يُحرَّر تلقائياً عند tx commit/rollback.
```

**القيود**:
- **INSERT مباشر على `activity_log` ممنوع** من أي مكان خارج helper — يُفرَض عبر code review (أو ESLint rule إن أمكن في Phase 3+).
- `logActivity` لا تبدأ tx خاصة بها؛ تأخذ `tx` من المستدعي (مهم: كل activity مرتبطة بنفس tx المالي).
- التحقق integration: بعد كل suite mutation، يفحص query أن `sha256(row_{n-1}.row_hash + canonical(row_n.data)) === row_n.row_hash` لكل n>0. كسر السلسلة = failed test.

**السبب**: `FOR UPDATE` على آخر صف لا يحمي الجدول الفارغ؛ tx متنافستان ترتبان INSERT مع `prev_hash=NULL` كلاهما. الـadvisory lock يسلسل الكتّاب منذ قبل الـSELECT.

**الملفات المتأثرة**:
- `src/lib/activity-log.ts` (Phase 3.0 code).
- `27_Audit_Log.md` (يربط بـ D-80 كعقد الكتابة).

**التاريخ**: 2026-04-20.

---

### D-81 — Phase 3.0 Infrastructure Precedence

**القرار**: قبل أول mutation endpoint جديد في Phase 3 (orders POST، cancel، start-preparation، purchase، expense، etc.) يجب أن:

1. `src/lib/activity-log.ts` موجود + unit-tested + integration-tested على `TEST_DATABASE_URL` (ليس skip).
2. `src/lib/idempotency.ts` موجود + unit-tested + integration-tested (ليس skip).
3. أي mutation handler جديد يستخدم helpers أعلاه؛ INSERT مباشر على `activity_log` أو `idempotency_keys` مرفوض في code review.
4. الـwrapper idempotency يقبل per-route config `{ endpoint: string, requireHeader: 'required'|'optional' }` وفق D-16 (إلزامي على cancel/collect/settlements/distributions، اختياري على orders/payments).

**شرط قبول Phase 3.0**: `TEST_DATABASE_URL` متوفر في CI + البيئة المحلية. بلا اتصال DB حقيقي لا يُقبَل أي checkpoint (integration tests ليست skippable في Phase 3.0).

**السبب**: بدء Phase 3 بـ UI أو endpoints قبل البنية الأساسية يخلق دين تقني فوري — activity_log/idempotency يحتاجان pattern موحَّد من أول mutation مالي.

**الملفات المتأثرة**:
- `DEVELOPMENT_PLAN.md` § Phase 3 المهام (يُشير إلى D-81 كشرط مسبق).
- `.github/workflows/ci.yml` (يُفعِّل `TEST_DATABASE_URL` secret قبل قبول Phase 3.0).

**التاريخ**: 2026-04-20.

---

### D-82 — expenses.reversal_of Schema

**القرار**: جدول `expenses` يكتسب عموداً جديداً `reversal_of` يربط الصف العكسي بالأصلي بنيوياً (لا convention نصي في `notes`):

```sql
ALTER TABLE expenses
  ADD COLUMN reversal_of INTEGER NULL
    REFERENCES expenses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT expenses_no_self_reversal
    CHECK (reversal_of IS NULL OR reversal_of <> id),
  ADD CONSTRAINT expenses_reversal_amount_negative
    CHECK (reversal_of IS NULL OR amount < 0);

CREATE UNIQUE INDEX expenses_one_reversal_per_original
  ON expenses (reversal_of)
  WHERE reversal_of IS NOT NULL AND deleted_at IS NULL;
```

**السبب**:
- `notes` حقل نص حر — لا يُفرَض، لا يُفهرَس، لا يُربَط، يتسرب (drift) مع الزمن.
- العكس المالي يحتاج مرجعاً بنيوياً لـ audit trail سليم (يتسق مع الصرامة في `idempotency_keys` ومنطق D-04/D-57).
- الـpartial unique يمنع الخطأ السهل: عكس نفس المصروف مرتين (double-reversal). الحالة `deleted_at IS NULL` في الفلتر تسمح بإعادة إنشاء reversal بعد soft-delete للأول (نادر، لكن تغطية صحيحة).
- CHECK على `amount < 0` للـreversal يضمن أن الصف العكسي فعلاً سالب.
- CHECK على `reversal_of <> id` يمنع السيلف (أي صف يشير لنفسه).
- `ON DELETE RESTRICT` متّسق مع D-04 (لا DELETE على expenses أصلاً، لكن احتياطاً).

**قواعد الاستخدام**:
- `POST /api/v1/expenses/[id]/reverse` هو المسار الوحيد لإنشاء صف عكسي (service layer ينشئ `expense` جديد بـ `amount = -original.amount`, `reversal_of = original.id`, `notes = reason`).
- `notes` يبقى للشرح فقط، **لا يُستخدم كمرجع بنيوي**.
- service يتحقق (قبل الـadvisory lock الذي يحمي idempotency):
  - الأصل موجود + `deleted_at IS NULL` + `reversal_of IS NULL` (لا تعكس صفاً عكسياً بنفسه).
  - لا يوجد صف آخر reversal_of=original.id بالفعل (guard مع الـpartial unique كـbackstop).

**الملفات المتأثرة**:
- `src/db/schema/treasury.ts` (Phase 3.0 code — الجدول expenses يعيش هنا).
- Migration جديدة `NNNN_expenses_reversal_of.sql` (Phase 3.0).
- `02_DB_Tree.md` § expenses (يُحدَّث الآن).
- `35_API_Endpoints.md` § expenses (يُحدَّث الآن ليُدرج `POST /api/v1/expenses/[id]/reverse`).

**التاريخ**: 2026-04-20.

---

## ملحق: القرارات السابقة (مؤكَّدة سابقاً في DEVELOPMENT_PLAN.md)

القرارات التالية أُخذت قبل مراجعات المدقِّقين الثلاثة وتظل سارية:

- Free-tier target (Vercel Hobby + Neon Free).
- Docs-first ≤300 lines/file.
- Arabic UI + English code + French invoices.
- 6 أدوار: pm, gm, manager, seller, driver, stock_keeper.
- Fresh build — no data migration.
- NUMERIC(19,2) + round2 + 0.01€ tolerance.
- `commit inside withTx` لكل mutation.
- Europe/Paris timezone لكل العمليات.

---

## إشارة الحالة

- **عدد القرارات الكلي**: **82** (D-01..D-82).
- **آخر تحديث**: 2026-04-20 (Phase 3.0 pre-code design — D-79..D-82 مضافة).
- **حالة التطبيق**:
  - **D-01..D-25**: مُطبَّقة بالكامل على specs (Phase 0a).
  - **D-26..D-65**: مُطبَّقة على specs (Phase 0c — المراجعات الداخلية 01..06).
  - **D-66..D-76**: مُطبَّقة على specs (Phase 0c — المراجعة الخارجية #07 + rebuttal).
  - **D-77**: مبدأ Phase Delivery Gate (متطلَّب proof).
  - **D-78**: مواصفة Delivery Acceptance Framework (13-gate + 13-section report). يُطبَّق على كل تسليم.
  - **D-79**: Idempotency reservation design (advisory lock + INSERT post-handler، لا صفوف ناقصة). Phase 3.0 infrastructure.
  - **D-80**: activity_log hash-chain write protocol (advisory lock يحمي الجدول الفارغ). Phase 3.0 infrastructure.
  - **D-81**: Phase 3.0 infrastructure precedence — activity_log + idempotency helpers قبل أي mutation handler جديد + TEST_DATABASE_URL شرط قبول.
  - **D-82**: expenses.reversal_of عمود FK بنيوي + partial unique + CHECK constraints. يحل محل convention في notes.
- **D-33 مُعلَّم SUPERSEDED** بواسطة D-73 (voice rate limit DB-only).
- **D-75 CI gates مُوسَّع من 7 إلى 13 بواسطة D-78**.
- **التالي**: Phase 3.0 code blocked على توفر `TEST_DATABASE_URL` (D-81). عند توفرها + تأكيد المستخدم "**ابدأ**" → يُنفَّذ Step B (activity_log helper + idempotency wrapper + integration tests + تعديل schema وفق D-82).

**Phase 0c closure report**: [`../audit-reports/07_developer_review_and_rebuttal.md`](../audit-reports/07_developer_review_and_rebuttal.md).
