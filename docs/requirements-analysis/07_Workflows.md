# سير العمل التفصيلي — Detailed Workflows

> **رقم العنصر**: #07 | **المحور**: ب | **الحالة**: مواصفات نهائية

---

## 1. سير عمل الشراء (Purchase)

1. PM/GM/Manager ينشئ مشترى (supplier_id + product_id + كمية + سعر).
2. **قبل الحفظ**: إذا المورد له `credit_due_from_supplier > 0` → UI يعرض خيار "استخدام الرصيد الدائن" (جزء من المبلغ أو كامله) — D-10.
3. النظام يولِّد `ref_code: PU-YYYYMMDD-NNNNN`.
4. داخل `withTx`:
   - `SELECT stock FROM products WHERE id=:product FOR UPDATE`.
   - المخزون يزيد بالكمية.
   - سعر الشراء يُحدَّث بالمتوسط المرجح: `newBuy = (oldStock × oldBuy + qty × price) / (oldStock + qty)`.
   - `INSERT price_history` إذا تغيَّر.
   - الدفعة (إذا `paid_amount > 0`): `INSERT supplier_payments` + `INSERT treasury_movement` category='supplier_payment' outflow.
   - إذا استُخدم رصيد دائن: `UPDATE suppliers SET credit_due_from_supplier = credit_due_from_supplier - :applied` (لا حركة treasury للجزء المستخدم من الرصيد).
   - `INSERT activity_log`.

---

## 2. سير عمل البيع (Order — متعدد الأصناف)

1. البائع/Manager/PM/GM ينشئ طلباً
2. يختار العميل (SmartSelect — موجود أو جديد تلقائياً BR-11)
3. يضيف أصناف (order_items): منتج + كمية + سعر
   - يمكن إضافة هدية (من gift_pool) — BR-36
   - يمكن تطبيق خصم (حسب حدود الدور) — BR-40/41
4. النظام يتحقق:
   - سعر كل صنف ≥ buy_price (BR-01)
   - بائع: سعر ≥ sell_price (BR-02)
   - كمية ≤ المتاح (BR-04)
5. النظام يولّد ref_code: `ORD-YYYYMMDD-NNNNN`
6. المخزون يُحجز فوراً لكل صنف (BR-05)
7. الحالة = "محجوز"
8. توصيل يُنشأ تلقائياً مرتبط بالطلب

---

## 3. سير عمل تحضير الطلب (Preparation — Stock Keeper)

**الانتقال "محجوز → قيد التحضير"** يتم صراحة عبر Stock Keeper:

1. Stock Keeper يفتح `/preparation` (قائمة طلبات بحالة `محجوز`، مُقيَّدة بصلاحية `preparation_queue:view`).
2. يضغط زر "ابدأ التحضير" على الطلب → `POST /api/orders/[id]/start-preparation` (مع `Idempotency-Key`).
3. الـ endpoint ذرياً:
   - يتحقق من `status='محجوز'` (وإلا 409).
   - `UPDATE orders SET status='قيد التحضير'`.
   - `UPDATE deliveries SET status='قيد التحضير' WHERE order_id=:id`.
   - يُدرج `activity_log` بـ `action='start_preparation'`.
4. الطلب يختفي من قائمة "محجوز" ويظهر في "قيد التحضير".
5. Stock Keeper يتحقق من الأصناف، ثم يضغط "جاهز" → `POST /api/orders/[id]/mark-ready`.
6. الـ endpoint ذرياً:
   - `UPDATE orders SET status='جاهز'`.
   - `UPDATE deliveries SET status='جاهز'`.
   - يُنشئ notification للسائق المعيَّن (إن وُجد).
   - `activity_log` INSERT.
7. الطلب الآن في قائمة مهام السائق.

**ملاحظة**: لا trigger تلقائي — التحكم بالانتقال يدوياً بيد Stock Keeper لضمان أن التحضير فعلاً بدأ.

---

## 4. سير عمل التوصيل (Delivery)

1. PM/GM/Manager يعيّن سائق (اختياري — BR-23)
2. السائق يبدأ التوصيل → الحالة = "جاري التوصيل"
3. عند الوصول:
   - إدخال VIN لكل صنف يحتاجه (حسب category) — BR-21/22
   - تأكيد التسليم
4. **عند التأكيد (ذرياً):**
   - الطلب → "مؤكد"
   - حساب عمولة لكل صنف حسب فئته (BR-29/30)
   - المعدل الساري = لحظة التسليم (BR-32)
   - تحصيل الدفعة (إذا كاش/بنك → المبلغ الكامل)
   - إنشاء فاتورة (BR-63)
   - **حركة treasury**: inflow في عهدة السائق (أو صندوق المؤكِد)

---

## 5. سير عمل إلغاء التوصيل "جاري"

1. PM/GM/Manager يطلب إلغاء توصيل بحالة "جاري التوصيل"
2. سبب إلزامي (BR-17)
3. التوصيل يعود → "قيد الانتظار"
4. الطلب يبقى → "محجوز"
5. **لا تأثير على مخزون أو عمولات** (لأن التسليم لم يتأكد)
6. يمكن إعادة تعيين سائق جديد

---

## 6. سير عمل إلغاء طلب (شاشة C1 — D-04 + D-18)

1. PM/GM/Manager (حتى `جاهز` — D-11) / Seller (خاصتي المحجوزة فقط) يفتح dialog الإلغاء.
2. الـ UI يستدعي `GET /api/orders/[id]/cancel-preview` لجلب حالة الـ bonuses الحالية.
3. **شاشة إلغاء موحَّدة** تظهر بـ 3 خيارات (مع defaults حسب D-18):

   **الخيار 1 — `return_to_stock`:**
   - `true` → المخزون يزيد بكمية كل صنف (بما فيه الهدايا).
   - `false` → تكلفة الشراء تُسجَّل ضمناً كخسارة (لا حركة إضافية).
   - **إلزامي — لا افتراضي**.

   **الخيار 2 — `seller_bonus_action`:**
   - إذا لا يوجد bonus للبائع → **default = `cancel_unpaid`** (UI يعرضها معطَّلة مع ملاحظة "لا عمولة بائع").
   - إذا يوجد:
     - `keep` → `bonuses.status='retained'` (مستبعدة من التسويات)
     - `cancel_unpaid` → soft-delete للـ bonus (deleted_at)
     - `cancel_as_debt` → INSERT settlement سالب (لعمولة settled فقط)
     - **إلزامي — لا افتراضي**.

   **الخيار 3 — `driver_bonus_action`:** نفس منطق `seller_bonus_action`.

4. `reason` نصي إلزامي (min 3 chars).
5. **عند الحفظ** (POST `/api/orders/[id]/cancel` مع `Idempotency-Key`، داخل `withTx`):
   - التحقق من `orders.status != 'ملغي'` (وإلا 409 `ALREADY_CANCELLED`).
   - التحقق من `bonusActions` الصحيحة (إذا bonuses exist وبلا action → 428 `BONUS_CHOICE_REQUIRED`).
   - التحقق من `cancel_as_debt` فقط إذا `bonus.settled=true` (وإلا خطأ validation).
   - `UPDATE orders SET status='ملغي', deleted_at=NOW(), cancel_reason=:reason`.
   - `UPDATE deliveries SET status='ملغي' WHERE order_id=:id`.
   - `UPDATE invoices SET status='ملغي' WHERE order_id=:id` (soft — BR-65).
   - معالجة الـ bonuses حسب الـ actions.
   - استرداد الدفعات: `INSERT INTO payments (type='refund', amount=-paid_amount)`.
   - حركة treasury refund (category='refund', inflow سالب).
   - إعادة gift_pool.remaining_quantity للهدايا.
   - إعادة stock إذا `return_to_stock=true`.
   - `INSERT INTO cancellations (reason, return_to_stock, seller_bonus_action, driver_bonus_action, ...)`.
   - `INSERT INTO activity_log`.

**ملاحظة D-04**: لا DELETE فعلي على أي من السجلات أعلاه. الإلغاء ناعم فقط.

---

## 7. سير عمل التحصيل من العميل

1. PM/GM/Manager/Seller يحصّل دفعة
2. يختار الطلب (أو FIFO)
3. يُدخل المبلغ (≤ المتبقي — BR-09)
4. يختار طريقة الدفع (كاش/بنك)
5. **عند الحفظ:**
   - سجل في payments
   - paid_amount و remaining يُحدّثان
   - payment_status يتغير (pending → partial → paid)
   - **حركة treasury**: inflow في صندوق المُحصّل

---

## 8. سير عمل دفع المورد

1. PM/GM/Manager يسجل دفعة لمورد على مشترى محدد
2. المبلغ ≤ المتبقي
3. **عند الحفظ:**
   - سجل في supplier_payments
   - paid_amount يُحدّث في purchases
   - **حركة treasury**: outflow من صندوق المُنفّذ

---

## 9. سير عمل عكس مشتريات (شاشة C5 — D-10)

`POST /api/purchases/[id]/reverse` (PM/GM فقط، `Idempotency-Key` مُوصى به).

1. PM/GM يفتح dialog عكس المشتريات.
2. **شاشة تأكيد** تسأل: "هل استُرد المبلغ المدفوع؟"
   - **نعم** → حركة `treasury_movement` category='refund' (inflow في الصندوق الأصلي).
   - **لا** → `UPDATE suppliers SET credit_due_from_supplier = credit_due_from_supplier + :paid_amount WHERE id=:supplier_id` (D-10 — خارج treasury).
3. **عند الحفظ** (داخل `withTx`):
   - التحقق من `purchases.status != 'reversed'` (idempotency).
   - `UPDATE purchases SET deleted_at=NOW(), reversal_mode='refund'|'credit'`.
   - `UPDATE products SET stock = stock - :qty` مع `FOR UPDATE`.
   - إعادة حساب `products.buy_price` (متوسط مرجح معكوس — صيغة 5 في `10_Calculation_Formulas.md`).
   - `INSERT price_history` بـ قيم عكسية.
   - إذا refund: `INSERT treasury_movement` للاسترداد.
   - إذا credit: `UPDATE suppliers.credit_due_from_supplier`.
   - `INSERT activity_log`.

**ملاحظة D-10**: `supplier_credit` ليس category في `treasury_movements`. الرصيد الدائن يُخزَّن في `suppliers.credit_due_from_supplier` ويُستهلك عند الشراء التالي من نفس المورد.

---

## 10. سير عمل التسوية (Settlement)

1. PM/GM يفتح صفحة التسويات
2. يختار نوع (بائع/سائق) → النظام يعرض المؤهلين مع الرصيد المتاح
3. يُدخل المبلغ (≤ المتاح)
4. **عند الحفظ:**
   - العمولات المرتبطة تُعلّم settled=true
   - سجل في settlements
   - **حركة treasury**: outflow من صندوق PM/GM

---

## 11. سير عمل صرف المكافأة

1. PM/GM يصرف مكافأة لبائع/سائق
2. يُدخل: المستلم + المبلغ + الوصف + النوع
3. **عند الحفظ:**
   - سجل في settlements (نوع = مكافأة)
   - يُسجل كمصروف → يُخصم من الأرباح
   - **حركة treasury**: outflow

---

## 12. سير عمل توزيع الأرباح

1. PM/GM يحدد الفترة (من-إلى)
2. النظام يحسب: صافي الربح النقدي = إيرادات محصّلة - تكاليف - عمولات مكتسبة - هدايا
3. يُدخل المستلمين + النسب (يجب = 100%)
4. **عند الحفظ:**
   - سجل في profit_distribution_groups + profit_distributions
   - **حركة treasury**: outflow لكل مستلم

---

## 13. سير عمل تسليم أموال السائق

1. السائق يضغط "تسليم الأموال"
2. يختار مديره
3. يُدخل المبلغ (≤ رصيد عهدته)
4. المدير يؤكد الاستلام
5. **حركة treasury**: transfer من عهدة السائق → صندوق المدير

---

## 14. سير عمل التسوية اليومية

1. Manager/GM يفتح صفحة الصندوق
2. يُدخل الرصيد الفعلي (عدّ يدوي)
3. النظام يقارن: فعلي vs محسوب
4. الفرق يُسجل كحركة reconciliation (+ أو -)

---

## 15. سير عمل الجرد (Inventory Count)

1. Stock Keeper/Manager يبدأ جرد عبر `/inventory` → `POST /api/inventory/count/start`.
2. النظام يولِّد قائمة بكل المنتجات `active=true` مع `expected = products.stock` لحظة البدء.
3. لكل منتج: يُدخل المستخدم `actual_quantity`.
4. `variance = round2(actual_quantity - expected_quantity)`.
5. `POST /api/inventory/count/submit` يُدرج صفوف `inventory_counts`.
6. إذا `|variance| > 0`: طلب موافقة PM/GM:
   - **PM/GM يوافق** → `UPDATE products SET stock = :actual_quantity` + `INSERT expense (category='inventory_loss', amount = expected - actual)` إذا نقص.
   - **PM/GM يرفض** → لا تغيير على المخزون؛ variance يبقى مُسجَّلاً لتدقيق لاحق.
7. `INSERT activity_log` لكل خطوة.

## 16. سير عمل إلغاء الفاتورة عبر Avoir (جديد — Report 3 H7)

إذا احتاج PM/GM إلغاء **فاتورة** دون إلغاء **طلب** (نادر لكن ممكن عند خطأ في الفاتورة الأصلية):

`POST /api/invoices/[id]/avoir` (PM/GM فقط):

1. التحقق من `invoices.status = 'مؤكد'`.
2. `INSERT INTO invoices (avoir_of_id = :original_id, total = -:original_total, status='مؤكد', date=NOW())` — فاتورة عكسية بمبلغ سالب.
3. ترقيم جديد `FAC-YYYY-MM-NNNN` للـ Avoir.
4. **لا تُحذف** الفاتورة الأصلية. تبقى `مؤكد` مع إشارة بصرية "يوجد Avoir".
5. محاسبياً: المبلغان يُلغيان بعضهما — cumulative revenue = 0 من هذا الطلب.
6. إصدار Avoir لا يُلغي الطلب الأصلي — يُصحِّح الفاتورة فقط. إذا المطلوب إلغاء العملية كاملة، يُستخدم `/api/orders/[id]/cancel` بدلاً منها.
