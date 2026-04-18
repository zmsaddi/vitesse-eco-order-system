# قواعد العمولات — Commission Rules

> **رقم العنصر**: #13 | **المحور**: ب | **الحالة**: قيد التحديث

---

## المبدأ الأساسي

العمولات تُحسب **حسب فئة المنتج** (وليس موحدة). كل فئة لها معدل مختلف — بيع دراجة ≠ بيع إكسسوار.

---

## هيكل العمولات

### أولوية المعدل (من الأعلى للأدنى)

1. **تجاوز المستخدم** (user_bonus_rates) — إذا وُجد
2. **قاعدة الفئة** (product_commission_rules) — حسب category
3. **الإعدادات الافتراضية** (settings) — seller_bonus_fixed, seller_bonus_percentage, driver_bonus_fixed

### توقيت الحساب

- العمولة تُحسب **لحظة تأكيد التسليم فقط** (BR-31)
- المعدل الساري = **لحظة التسليم** وليس وقت إنشاء الطلب (قرار M14)
- لا عمولات قبل التسليم — تعديل طلب محجوز لا يولّد عمولات

### أهلية العمولة

| الدور | عمولة بيع | عمولة توصيل | ملاحظة |
|-------|:---------:|:-----------:|--------|
| PM/GM/Manager | قابل للتكوين | قابل للتكوين | حسب الإعدادات (قرار M1) |
| Seller | ✅ | ❌ (افتراضي) | يكسب على مبيعاته |
| Driver | ❌ | ✅ | يكسب على توصيلاته |
| Stock Keeper | ❌ | ❌ | لا عمولات |

---

## صيغة عمولة البائع (لكل صنف)

```
sellerFixed = override ?? categoryRule ?? settings.seller_bonus_fixed
sellerPct   = override ?? categoryRule ?? settings.seller_bonus_percentage

fixedTotal  = round2(sellerFixed × quantity)
extraMargin = max(0, actualPrice - recommendedPrice)
extraBonus  = round2(extraMargin × quantity × sellerPct / 100)

sellerBonus = round2(fixedTotal + extraBonus)
```

**ملاحظة**: تُحسب لكل order_item بشكل مستقل (BR-30).

---

## صيغة عمولة السائق (لكل توصيل)

```
driverFixed = override ?? categoryRule ?? settings.driver_bonus_fixed
driverBonus = round2(driverFixed)
```

عمولة واحدة لكل توصيل (وليس لكل صنف).

---

## سير عمل العمولة

```
طلب يُنشأ ──→ لا عمولة (محجوز)
     │
تسليم يُؤكد ──→ عمولة تُحسب لكل صنف (seller) + عمولة واحدة (driver)
     │
     └──→ settled = false (غير مصروفة)
               │
     تسوية ──→ settled = true + settlement_id
```

---

## الإلغاء والعمولات (شاشة C1)

عند إلغاء طلب، لكل من البائع والسائق:

| حالة العمولة | خيار "إلغاء" | النتيجة |
|-------------|:------------:|---------|
| غير مصروفة (settled=false) | نعم | تُحذف |
| مصروفة (settled=true) | نعم | تُسجل كتسوية سالبة (دين) |
| أي حالة | إبقاء | لا تغيير |

**لا قيم افتراضية** — يجب تحديد الخيار يدوياً (قرار C1).

---

## القيود

- seller_percentage: 0-100 (CHECK constraint — BR-34/M5)
- seller_fixed ≥ 0
- driver_fixed ≥ 0
- bonuses.order_id = NOT NULL دائماً (M12)
- UNIQUE: (delivery_id, role, item) — عمولة واحدة لكل صنف لكل دور لكل توصيل
