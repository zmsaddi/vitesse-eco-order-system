# صيغ الحساب — Calculation Formulas

> **رقم العنصر**: #10 | **المحور**: ب | **الحالة**: مواصفات نهائية
> **المصدر الكنسي**: هذا الملف هو المرجع الوحيد لجميع الصيغ الحسابية
> **مبدأ أساسي**: كل الأرقام TTC. TVA تُحسب فقط عند توليد الفاتورة (قرار H1، D-02).
> **الدقة**: `NUMERIC(19,2)` — `round2(x) = Math.round((x + Number.EPSILON) * 100) / 100`
> **قاعدة أساس**: العمولات والخصومات محسوبة على **TTC** (ليس HT).

---

## 1. إجمالي صنف في الطلب (Order Item Line Total)

```
lineTotal = round2(quantity × unitPrice)

// مع خصم:
if discount_type = 'percent':
  lineTotal = round2(quantity × unitPrice × (1 - discount_value / 100))
if discount_type = 'fixed':
  lineTotal = round2(quantity × unitPrice - discount_value)

// هدية:
if is_gift = true:
  lineTotal = 0  // يظهر بالفاتورة: سعر + خصم 100%
```

---

## 2. إجمالي الطلب (Order Total)

```
totalAmount = SUM(lineTotal) for all order_items where is_gift = false
              AND deleted_at IS NULL
// الهدايا لا تُضاف للإجمالي (lineTotal = 0)
```

---

## 3. المتبقي (Remaining)

```
remaining = round2(totalAmount - paidAmount)
```

حيث `paidAmount = SUM(payments.amount) WHERE order_id = :order AND type IN ('collection','advance') AND deleted_at IS NULL` (موقَّع؛ refund يُنقص).

---

## 4. حالة الدفع (Payment Status)

```
if paidAmount = 0 AND remaining > 0     → 'pending'
if paidAmount > 0 AND remaining > 0.01  → 'partial'
if remaining ≤ 0.01                     → 'paid'
if order.status = 'ملغي'                → 'cancelled'
```

---

## 5. المتوسط المرجح لسعر الشراء (Weighted Average Buy Price)

```
// عند شراء جديد داخل withTx:
// 1. SELECT ... FROM products WHERE id = :product FOR UPDATE
// 2. حساب الجديد:
newBuyPrice = round2(
  (oldStock × oldBuyPrice + newQuantity × newUnitPrice)
  / (oldStock + newQuantity)
)
// 3. UPDATE products SET buy_price = newBuyPrice, stock = oldStock + newQuantity
// 4. INSERT INTO price_history (...)

// عند حذف مشتريات ضمن C5 workflow (soft-delete):
if (currentStock - deletedQuantity) > 0:
  revertedBuyPrice = round2(
    (currentStock × currentBuyPrice - deletedQuantity × deletedUnitPrice)
    / (currentStock - deletedQuantity)
  )
else:
  revertedBuyPrice = 0
// لا تُحذف صف purchases — deleted_at يُعبَّأ. price_history يُدرج عكسي.
```

---

## 6. عمولة البائع لكل صنف (Seller Bonus per order_item)

صيغة v2 تعتمد على `commission_rule_snapshot` المحفوظ في `order_items` وقت إنشاء الطلب (D-17) — ليس على القواعد الحالية.

```
// المدخلات من order_items (snapshot):
actualPrice       = order_items.unit_price       // بعد الخصم
recommendedPrice  = order_items.recommended_price // snapshot من products.sell_price عند الإنشاء
snapshot          = order_items.commission_rule_snapshot  // JSONB
sellerFixed       = snapshot.seller_fixed_per_unit
sellerPct         = snapshot.seller_pct_overage

// الحساب (عند تأكيد التسليم):
fixedTotal  = round2(sellerFixed × quantity)
extraMargin = max(0, actualPrice - recommendedPrice)
extraBonus  = round2(extraMargin × quantity × sellerPct / 100)
sellerBonus = round2(fixedTotal + extraBonus)
```

### أولوية مصدر القواعد عند إنشاء الـ snapshot

عند إدراج `order_items` جديد:

```
1. قراءة user_bonus_rates للمستخدم created_by (إن وُجد)
2. قراءة product_commission_rules للفئة (إن وُجدت)
3. قراءة settings.seller_bonus_* كـ fallback
4. دمج بالأولوية: user → category → settings
5. تخزين النتيجة في order_items.commission_rule_snapshot مع source + captured_at
```

**ملاحظة** (D-17): حتى لو غيَّر PM قاعدة عمولة بين إنشاء الطلب وتأكيد التسليم، الـ snapshot المحفوظ هو المُعتمد.

---

## 7. عمولة السائق لكل توصيل (Driver Bonus)

```
// من snapshot كذلك (مخزَّن لكل order_item لكن قيمة موحَّدة للطلب):
driverFixed = snapshot.driver_fixed_per_delivery

// عمولة واحدة للسائق لكل توصيل (وليس لكل صنف):
driverBonus = round2(driverFixed)
// يُسجَّل كصف واحد في bonuses بـ role='driver' مع order_item_id NULL أو الأول
```

---

## 8. TVA — ضريبة القيمة المضافة (للفاتورة فقط — لا تُخزَّن)

```
// تُحسب من TTC عند توليد PDF الفاتورة. لا تُخزَّن في أي جدول (D-02).
vatRate = settings.vat_rate  // افتراضي: 20

tvaAmount = round2(totalTTC × vatRate / (100 + vatRate))
amountHT  = round2(totalTTC - tvaAmount)

// مثال: 1200€ TTC
// tva = 1200 × 20 / 120 = 200€
// ht  = 1200 - 200 = 1000€
```

Helper: `tvaFromTtc(ttc, rate)`, `htFromTtc(ttc, rate)` في `src/lib/tva.ts`.

**ملاحظة**: المحاسبة الخارجية (expert-comptable) تتولى تقارير TVA من الفواتير PDF (pièces justificatives).

---

## 9. صافي الربح للفترة (Net Profit — cash basis)

```
revenue        = SUM(payments.amount) WHERE type IN ('collection','refund','advance')
                 AND date BETWEEN :start AND :end
                 AND deleted_at IS NULL
                 // payments.amount موقَّع → refund سالب يُنقِص revenue تلقائياً (D-06)

cogs_period    = SUM(order_items.cost_price × quantity)
                 JOIN orders ON order_items.order_id = orders.id
                 WHERE orders.status = 'مؤكد'
                 AND orders.confirmation_date BETWEEN :start AND :end
                 AND order_items.is_gift = false
                 AND order_items.deleted_at IS NULL
                 AND orders.deleted_at IS NULL
                 // D-08: COGS للمنتجات المبيعة (ليس purchases.total)

expenses       = SUM(expenses.amount) WHERE date BETWEEN :start AND :end AND deleted_at IS NULL
earnedBonuses  = SUM(bonuses.total_bonus) WHERE date BETWEEN :start AND :end AND deleted_at IS NULL
giftCost       = SUM(order_items.cost_price × quantity)
                 JOIN orders ON order_items.order_id = orders.id
                 WHERE orders.status = 'مؤكد'
                 AND orders.confirmation_date BETWEEN :start AND :end
                 AND order_items.is_gift = true
                 AND order_items.deleted_at IS NULL
                 // منفصل عن cogs_period (D-07)
rewards        = SUM(settlements.amount) WHERE type = 'reward' AND date BETWEEN :start AND :end AND deleted_at IS NULL

netProfit = round2(revenue - cogs_period - expenses - earnedBonuses - giftCost - rewards)
```

**ملاحظات حاكمة**:
- Revenue يشمل refund/advance موقَّعاً (D-06). Dashboard قد يعرض gross revenue (`WHERE type='collection'`) منفصلاً عن net cash.
- COGS ≠ purchases (D-08).
- giftCost **منفصل** عن cogs_period لمنع الخصم المكرَّر (D-07).

---

## 10. الربح المتاح للتوزيع (Distributable Profit)

```
totalDistributed = SUM(profit_distributions.amount)
                   WHERE base_period_start = :start AND base_period_end = :end
                   AND deleted_at IS NULL

distributableProfit = round2(netProfit - totalDistributed)
```

- لا يمكن توزيع أكثر من المتاح (محمي بـ `pg_advisory_xact_lock(hashtext(period_key))` — راجع `14_Profit_Distribution_Rules.md`).
- كل فترة تُوزَّع مرة واحدة فقط (BR-59/L5).

---

## 11. الرصيد المتاح للتسوية (Available Credit for Settlement)

Phase 4.4 — نطاق تسمية موحَّد: `unpaid` هو الحالة الكنسية للـ bonus قبل دفعه (كان في الوثائق القديمة `unsettled`، والكود لم يستخدم هذا التوكن قط). الديون غير المستهلكة تُخصم تلقائياً من أي تسوية قادمة لنفس `(user_id, role)` عبر `applied_in_settlement_id`.

```
unpaidBonuses = SUM(bonuses.total_bonus)
                 WHERE user_id = :user
                 AND status = 'unpaid'
                 AND deleted_at IS NULL

unappliedDebt = SUM(settlements.amount)
                 WHERE user_id = :user
                 AND type = 'debt'
                 AND applied = false
                 AND deleted_at IS NULL
// amount سالب دائماً على type='debt' → unappliedDebt <= 0

availableCredit = round2(unpaidBonuses + unappliedDebt)
// الديون غير المستهلكة تُقلِّص الرصيد المتاح قبل أن يُصرَف
```

**مسار الاستهلاك (consumption)**: `POST /api/v1/settlements { kind: "settlement" }` يقفل كل صفوف `type='debt', applied=false` للمستخدم+الدور، ويجمعها في `debtTotal`، ويحسب `netPayout = grossBonus + debtTotal`. إذا `netPayout < 0` → 409 `DEBT_EXCEEDS_PAYOUT` بلا أثر. وإلّا تُدفع الـ `netPayout` وتُعلَّم كل الديون المقفولة `applied=true`.

---

## 12. رصيد الصندوق (Treasury Balance)

```
// الرصيد يُحدَّث ذرياً مع كل حركة داخل withTx (BR-53)
// لا يُحسب من الحركات عند كل استعلام — يُقرأ مباشرة من treasury_accounts.balance

// التحقق (للتسوية اليومية فقط):
calculatedBalance = initialBalance
  + SUM(treasury_movements.amount WHERE to_account_id = :acc AND deleted_at IS NULL)
  - SUM(treasury_movements.amount WHERE from_account_id = :acc AND deleted_at IS NULL)

variance = actualBalance - calculatedBalance
// إذا |variance| > 0.01 → INSERT treasury_movement بـ category='reconciliation' ليصفي الفرق
```

---

## 13. ربح الطلب الواحد (Per-Order Profit) — D-07 محدَّث

```
// المُدخلات — JOIN orders + order_items + payments + bonuses
orderRevenue   = order.paid_amount                              // TTC
orderItemsCost = SUM(order_items.cost_price × quantity)         // D-07: الأصناف العادية فقط
                 WHERE order_id = :order
                 AND is_gift = false
                 AND deleted_at IS NULL
orderGiftCost  = SUM(order_items.cost_price × quantity)         // الهدايا منفصلة (D-07)
                 WHERE order_id = :order
                 AND is_gift = true
                 AND deleted_at IS NULL
orderBonuses   = SUM(bonuses.total_bonus)
                 WHERE order_id = :order
                 AND deleted_at IS NULL

orderProfit = round2(orderRevenue - orderItemsCost - orderBonuses - orderGiftCost)
```

**التصحيح (D-07)**: الصيغة السابقة كانت `orderCost = SUM(cost_price × qty)` شاملة للهدايا + `orderGiftCost` منفصل → **خصم مكرَّر**. الصحيح الآن: `orderItemsCost` يستثني الهدايا (`is_gift=false`)، والهدايا تُخصم مرة واحدة عبر `orderGiftCost`.

---

## 14. فارق الجرد (Inventory Variance)

```
expectedQuantity = products.stock AT count_date
actualQuantity   = (user input)
variance         = round2(actualQuantity - expectedQuantity)

// إذا variance ≠ 0 → PM يعتمد قرار:
//   - adjust:  UPDATE products SET stock = actualQuantity + INSERT expense (category='inventory_loss')
//   - investigate: لا تغيير، المتابعة يدوياً
```

---

## 15. مسنودات قانونية

- كل الحسابات تتم داخل `withTx` حقيقية (D-05) لضمان atomicity.
- كل الأرقام `NUMERIC(19,2)` (قرار الدقة).
- تسامح المقارنة: `0.01€` (نصف سنت).
- التقريب: `round2(x)` باستخدام `Number.EPSILON` لمنع FP drift.
- JOINs تُفلتر `deleted_at IS NULL` دائماً (أو تستخدم `active_*` views).
