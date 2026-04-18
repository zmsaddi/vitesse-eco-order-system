# صيغ الحساب — Calculation Formulas

> **رقم العنصر**: #10 | **المحور**: ب | **الحالة**: قيد التحديث
> **المصدر الكنسي**: هذا الملف هو المرجع الوحيد لجميع الصيغ الحسابية
> **مبدأ أساسي**: كل الأرقام TTC — TVA تُحسب فقط عند توليد الفاتورة (قرار H1)
> **الدقة**: NUMERIC(19,2) — round2(x) = Math.round((x + ε) × 100) / 100

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
totalAmount = sum(lineTotal) for all order_items where is_gift = false
// الهدايا لا تُضاف للإجمالي (lineTotal = 0)
```

---

## 3. المتبقي (Remaining)

```
remaining = round2(totalAmount - paidAmount)
```

---

## 4. حالة الدفع (Payment Status)

```
if paidAmount = 0 AND remaining > 0     → 'pending'
if paidAmount > 0 AND remaining > 0.01  → 'partial'
if remaining ≤ 0.01                     → 'paid'
if order.status = 'ملغي'               → 'cancelled'
```

---

## 5. المتوسط المرجح لسعر الشراء (Weighted Average Buy Price)

```
// عند شراء جديد:
newBuyPrice = round2(
  (oldStock × oldBuyPrice + newQuantity × newUnitPrice)
  / (oldStock + newQuantity)
)

// عند حذف مشتريات (عكس):
if (currentStock - deletedQuantity) > 0:
  revertedBuyPrice = round2(
    (currentStock × currentBuyPrice - deletedQuantity × deletedUnitPrice)
    / (currentStock - deletedQuantity)
  )
else:
  revertedBuyPrice = 0
```

---

## 6. عمولة البائع لكل صنف (Seller Bonus per Item)

```
// المعدل: من product_commission_rules حسب category
// التجاوز: من user_bonus_rates إن وُجد
// التوقيت: المعدل الساري لحظة التسليم (BR-32/M14)

sellerFixed = userOverride.seller_fixed ?? categoryRule.seller_fixed_per_unit ?? settings.seller_bonus_fixed
sellerPct   = userOverride.seller_percentage ?? categoryRule.seller_pct_overage ?? settings.seller_bonus_percentage

fixedTotal  = round2(sellerFixed × quantity)
extraMargin = max(0, actualPrice - recommendedPrice)
extraBonus  = round2(extraMargin × quantity × sellerPct / 100)

sellerBonus = round2(fixedTotal + extraBonus)
```

**أولوية المعدل**: تجاوز المستخدم → قاعدة الفئة → الإعدادات الافتراضية

---

## 7. عمولة السائق لكل توصيل (Driver Bonus)

```
driverFixed = userOverride.driver_fixed ?? categoryRule.driver_fixed_per_delivery ?? settings.driver_bonus_fixed

// عمولة واحدة لكل توصيل (وليس لكل صنف)
driverBonus = round2(driverFixed)
```

**ملاحظة**: أهلية العمولة قابلة للتكوين لكل دور (BR-33/M1).

---

## 8. TVA — ضريبة القيمة المضافة (للفاتورة فقط)

```
// تُحسب من المبلغ TTC عند توليد PDF الفاتورة
vatRate = settings.vat_rate  // افتراضي: 20

tvaAmount = round2(amountTTC × vatRate / (100 + vatRate))
amountHT  = round2(amountTTC - tvaAmount)

// مثال: 1200€ TTC
// tva = 1200 × 20 / 120 = 200€
// ht  = 1200 - 200 = 1000€
```

**ملاحظة**: TVA لا تُخزّن في أي جدول. تُحسب عند العرض فقط (قرار H1/M2).

---

## 9. صافي الربح للفترة (Net Profit)

```
revenue        = sum(payments.amount) WHERE type = 'collection' AND date IN period
purchaseCost   = sum(purchases.total) WHERE date IN period
expenses       = sum(expenses.amount) WHERE date IN period
earnedBonuses  = sum(bonuses.total_bonus) WHERE date IN period
giftCost       = sum(order_items.cost_price × quantity) WHERE is_gift = true AND date IN period
rewards        = sum(settlements.amount) WHERE type = 'reward' AND date IN period

netProfit = round2(revenue - purchaseCost - expenses - earnedBonuses - giftCost - rewards)
```

---

## 10. الربح المتاح للتوزيع (Distributable Profit)

```
totalDistributed = sum(profit_distributions.amount) WHERE period overlaps
distributableProfit = round2(netProfit - totalDistributed)

// لا يمكن توزيع أكثر من المتاح
// كل فترة تُوزّع مرة واحدة فقط (BR-59/L5)
```

---

## 11. الرصيد المتاح للتسوية (Available Credit for Settlement)

```
unsettledBonuses = sum(bonuses.total_bonus) WHERE settled = false AND username = X
recoveryDebt     = sum(settlements.amount) WHERE amount < 0 AND username = X  // ديون استرداد

availableCredit = round2(unsettledBonuses + recoveryDebt)
// recoveryDebt سالب → يُنقص من المتاح
```

---

## 12. رصيد الصندوق (Treasury Balance)

```
// الرصيد يُحدّث ذرياً مع كل حركة (BR-53)
// لا يُحسب من الحركات — يُقرأ مباشرة من treasury_accounts.balance

// التحقق (للتسوية اليومية):
calculatedBalance = initialBalance
  + sum(treasury_movements.amount WHERE to_account_id = X)
  - sum(treasury_movements.amount WHERE from_account_id = X)

variance = actualBalance - calculatedBalance
// إذا variance ≠ 0 → حركة reconciliation
```

---

## 13. ربح الطلب الواحد (Per-Order Profit)

```
orderRevenue    = order.paid_amount
orderCost       = sum(order_items.cost_price × quantity)
orderBonuses    = sum(bonuses.total_bonus) WHERE order_id = X
orderGiftCost   = sum(order_items.cost_price × quantity) WHERE is_gift = true
orderDiscounts  = sum(discount impact) for non-gift items

orderProfit = round2(orderRevenue - orderCost - orderBonuses - orderGiftCost)
```
