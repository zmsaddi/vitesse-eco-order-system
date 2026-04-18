# صيغ الحساب والخوارزميات — Calculation Formulas

> **المصدر الكنسي**: هذا الملف هو المرجع الوحيد لجميع الصيغ الحسابية
> **الدقة المالية**: 0.01€ (منزلتان عشريتان) — موحد في كل مكان

---

## 1. المتوسط المرجح لسعر الشراء

```
newBuyPrice = (oldStock × oldBuyPrice + newQty × newUnitPrice) / (oldStock + newQty)
```

**عند حذف مشترى (عكس الصيغة)**:
```
prevBuyPrice = (currentBuyPrice × currentStock - qty × unitPrice) / newStock
```

---

## 2. حساب إجمالي وربح البيع

```
total     = quantity × unitPrice
costTotal = quantity × costPrice       (costPrice = product.buy_price)
profit    = total - costTotal
remaining = total - downPaymentExpected
```

---

## 3. حساب TVA / ضريبة القيمة المضافة

```
tva = amount × vatRate / (100 + vatRate)
```

**التقريب**: إلى أقرب 0.01€
**عند الاسترداد**: TVA سالب (لتصفير الميزان الضريبي)

---

## 4. حساب حالة الدفع

```
if (paidAmount >= total - 0.01)      → 'paid'
else if (paidAmount > 0.01)          → 'partial'
else                                 → 'pending'
```

**الدقة**: 0.01€ موحد في جميع المقارنات المالية (مبيعات + مشتريات + تسويات)

---

## 5. حساب العمولات

### عمولة البائع
```
extra       = max(0, actualPrice - recommendedPrice) × quantity
extraBonus  = extra × sellerPercentage / 100
fixedTotal  = sellerFixed × quantity
totalBonus  = fixedTotal + extraBonus
```

### عمولة السائق
```
fixedTotal  = driverFixed × quantity
totalBonus  = fixedTotal    (لا مكون نسبي)
```

**التوقيت**: تُحسب فقط عند تأكيد التسليم — لا عمولات قبل التسليم
**الأولوية**: user_bonus_rates (إن وُجد) → settings (افتراضي)

---

## 6. حساب المتبقي بعد التحصيل

```
newPaidAmount = oldPaidAmount + collectedAmount
newRemaining  = total - newPaidAmount
```

---

## 7. حساب صافي الربح لتوزيع الأرباح

```
netProfitCashBasis = collectedRevenue - refunds - COGS - expenses - earnedBonuses
availableForDistribution = netProfitCashBasis - alreadyDistributed
```

**تعريف earnedBonuses**: جميع العمولات **المكتسبة** (earned) — أي عمولة حُسبت عند تأكيد التسليم، بغض النظر عن حالة الصرف (settled أو unsettled). هذا يضمن حجز المبالغ المُلتزم بها للموظفين قبل التوزيع.

---

## 8. حساب حصة كل مستلم في التوزيع

```
recipientAmount = baseAmount × recipientPercentage / 100
```

**التحقق**: `Σ(percentages) = 100% (± 0.01%)`

---

## 9. حساب الرصيد المتاح للتسوية

```
availableCredit = unsettledBonusTotal + recoveryDebt

where:
  unsettledBonusTotal = sum(bonuses WHERE settled=false AND username=X)
  recoveryDebt        = sum(settlements WHERE amount < 0 AND username=X)  // سالب
```

---

## 10. حساب قيمة المخزون

```
inventoryValue = Σ(product.stock × product.buy_price)  for each product
```
