# Audit Report 3 — Cross-File Contradictions

> **التاريخ**: 2026-04-19
> **النطاق**: تناقضات بين ملفات spec متعددة + صيغ غامضة
> **النتيجة**: 5 blockers + 10 high + 11 medium + 7 low = **33 بند**

---

## القسم الأول — تناقضات قاتلة (Blockers)

### 1. `invoice_mode` له قيمتان متناقضتان في مصادر كنسية
- قرار H7 في README.md وBR-65 في 09_Business_Rules.md يقولان: `invoice_mode = soft`.
- لكن seed البيانات في 02_DB_Tree.md يقول: `invoice_mode = 'single_facture_three_states'`.
- نفس المفتاح بقيمتين مختلفتين. يجب حسم.

### 2. ترقيم الفواتير مختلف بثلاث طرق
- BR-64 وBR-67 في 09_Business_Rules.md: `INV-YYYYMM-NNN` (بادئة INV، 3 أرقام).
- 11_Numbering_Rules.md: `FAC-YYYY-MM-NNNN` (بادئة FAC، 4 أرقام).
- README.md يوافق BR (INV-YYYYMM-NNN).
- يجب اختيار شكل واحد نهائي والتطبيق في كل الملفات.

### 3. عمود `payments.tva_amount` مُستخدم لكنه غير موجود في الـ schema
- 12_Accounting_Rules.md يعتمد عليه بالكامل لمسار تدقيق TVA.
- DEVELOPMENT_PLAN.md يُدرج `INSERT payments(... tva_amount signed)`.
- لكن 02_DB_Tree.md جدول payments لا يحتوي `tva_amount`.

### 4. تناقض داخلي حاد في 12_Accounting_Rules.md
- الفقرة العلوية: "TVA يُسجَّل كجزء من كل صف payments".
- الفقرة السفلية (بعد 100 سطر): "لا تُخزّن في أي جدول. تُحسب عند توليد PDF".
- **الملف يناقض نفسه في نفس الصفحة**.

### 5. قيم الحالات مختلطة بين الفراغ والـ underscore داخل CHECK واحد
- orders.status: `'قيد_التحضير'` (بشرطة).
- deliveries.status: مزيج (`'قيد الانتظار'` بفراغ + `'قيد_التحضير'` بشرطة).
- خطأ نسخ نص = DB يرفض INSERT. يجب توحيد.

---

## القسم الثاني — تناقضات خطيرة (High)

### 6. C6 invariant يتناقض مع "حذف ناعم دائماً"
- 08_State_Transitions.md invariant C6: "PM فقط، يحذف rows".
- BR-48: "لا حذف نهائي".
- قرار H5: "حذف ناعم دائماً".
- C6 اختبار لوظيفة غير موجودة. تُحذف C6.

### 7. تعريف الإيرادات مختلف بين ملفين
- 10_Calculation_Formulas.md صيغة #9: `revenue = sum(payments.amount) WHERE type = 'collection'` فقط.
- 14_Profit_Distribution_Rules.md: `collected_net = SUM(...) WHERE type IN ('collection','refund','advance')`.
- حساب صافي الربح في dashboard سيخالف قاعدة توزيع الأرباح.

### 8. خطأ حسابي في صيغة ربح الطلب (Formula 13)
```
orderCost      = sum(order_items.cost_price × quantity)  // كل الأصناف بما فيها الهدايا
orderGiftCost  = sum(... × quantity) WHERE is_gift = true
orderProfit    = orderRevenue - orderCost - orderBonuses - orderGiftCost
```
تكلفة الهدية مخصومة مرتين.

### 9. تناقض داخلي في 14_Profit_Distribution_Rules.md
- الصيغة في البداية: `costs = SUM(cost_of_goods) + ...` (COGS).
- القاعدة #5 في نفس الملف: "التكلفة تشمل: مشتريات + ...".
- COGS ≠ Purchases.

### 10. `collected_net` يجمع الـ refunds بلا تعريف للإشارة
لا يُحدد في 02_DB_Tree.md هل `payments.amount` للـ refund موجب أم سالب.

### 11. شاشة الإلغاء C1 — "لا قيم افتراضية" يتناقض مع "افتراضياً cancel_unpaid"
- README قرار C1: "لا قيم افتراضية".
- BR-18: "عند عدم وجود عمولات: القيمة `cancel_unpaid` افتراضياً".
- BR-18 يوفر استثناء منطقي، الآخَران يرفضانه بإطلاق.

### 12. خريطة المراحل بين README و DEVELOPMENT_PLAN غير متطابقة
- README.md: 9 مراحل (0–8).
- DEVELOPMENT_PLAN.md: 7 مراحل (0–6).

### 13. GM ليس "نفس PM" كما يدّعي README
- README: "GM = نفس PM + يملك الصندوق".
- 15_Roles_Permissions.md: GM ❌ في `/permissions`.

### 14. صلاحيات Manager للإلغاء متضاربة
- 15_Roles_Permissions.md: Manager ✅ (محجوز فقط).
- 08_State_Transitions.md: Manager صالح للإلغاء من محجوز + قيد التحضير + جاهز.

### 15. Real-time: SSE في README، Polling في DEV_PLAN، SSE بلا flag في API
ثلاث روايات لنفس القرار.

---

## القسم الثالث — تناقضات متوسطة (Medium) — 11 بند

16 عدد الجداول مُبهم (35/36/37)، 17 notification_preferences.channel ميتة، 18 supplier_credit يُخرّب treasury، 19 انتقال محجوز→قيد التحضير بلا تريغر، 20 recommended_price غامض، 21 تكرار down_payment، 22 product_images CASCADE مع "لا حذف"، 23 driver_tasks.related_entity_type بلا CHECK، 24 لا endpoint لإلغاء فاتورة، 25 low_stock_threshold INT vs stock NUMERIC، 26 Phase 2 deliverable mismatch.

---

## القسم الرابع — مخاطر منخفضة (Low) — 7 بند

27 VIN مكرر، 28 invoice_mode name weak، 29 retention 90d vs 10 سنوات قانوني، 30 timezone توزيع، 31 Node 24 على Vercel، 32 bonuses.order_id soft-delete، 33 settings كـ TEXT بلا typing.

---

## التوصيات العملية قبل كتابة سطر واحد من الكود

1. حسم `invoice_mode` (soft أم single_facture…).
2. حسم ترقيم الفواتير (INV أم FAC).
3. حسم `payments.tva_amount`.
4. حسم قيم status (فراغ أم underscore).
5. حسم تعريف الإيرادات.
6. حسم P&L costs (Purchases أم COGS).
7. حسم real-time (SSE أم Polling).
8. حسم GM vs PM.
9. حسم خريطة المراحل.
10. إضافة تريغر محدد لـ محجوز → قيد التحضير.
11. حذف supplier_credit من treasury.
12. CHECK constraint على driver_tasks.related_entity_type.
13. مراجعة activity_log retention مع محاسب.

---

## خلاصة

المشروع ليس جاهزاً للـ Phase 0 رغم ادّعاء الـ DEVELOPMENT_PLAN.md أن "كل الوثائق محدَّثة ومكتملة". عدد التناقضات الكنسية (داخل وبين الملفات) يكفي لأن أول developer يدخل سيتوقف في يومه الأول طالباً clarification. 13 قراراً يحتاج الحسم قبل أن تُكتب أي هجرة schema.
