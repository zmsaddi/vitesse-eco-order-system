# قواعد العمولات — Commission Rules

> **رقم العنصر**: #13 | **المحور**: ب | **الحالة**: مواصفات نهائية

---

## المبدأ الأساسي

العمولات تُحسب **حسب فئة المنتج** (وليس موحدة). كل فئة لها معدل مختلف — بيع دراجة ≠ بيع إكسسوار.

---

## هيكل العمولات

### أولوية المعدل (من الأعلى للأدنى)

1. **تجاوز المستخدم** (user_bonus_rates) — إذا وُجد
2. **قاعدة الفئة** (product_commission_rules) — حسب category
3. **الإعدادات الافتراضية** (settings) — seller_bonus_fixed, seller_bonus_percentage, driver_bonus_fixed

### توقيت الحساب (D-17 — تحديث)

- العمولة تُحسب **لحظة تأكيد التسليم** (BR-31).
- **مصدر القواعد** = `order_items.commission_rule_snapshot JSONB` (مُحفوظ عند إنشاء الطلب)، ليس القواعد الحالية وقت التسليم.
- **المبرر**: حماية البائع من تغيير القواعد بعد الالتزام بالطلب. إذا غيَّر PM القاعدة بعد الإنشاء، الطلب الجديد فقط يستخدم الجديد.
- القرار M14 القديم ("المعدل لحظة التسليم") **يُلغى** ويُستبدَل بـ D-17 ("snapshot وقت الإنشاء").
- لا عمولات قبل التسليم — تعديل طلب محجوز لا يولّد عمولات.

### حماية من snapshot قديم (D-53 — Stale Commission Mitigation)

D-17 يحمي البائع، لكن قد يُستَغلَّ (إنشاء طلب بمعدل قديم مرتفع + تأجيل التأكيد لشهور). الحل:

```
if (orders.created_at < NOW() - INTERVAL '60 days') {
  // استخدم الأقل بين المعدل المُخزَّن والمعدل الحالي
  applied_rate = min(snapshot.rate, current.rate);
}

if (orders.created_at < NOW() - INTERVAL '90 days') {
  // يرفع notification لـ PM للمراجعة اليدوية
  notify_pm('stale_commission_review_required', order_id);
}
```

التطبيق في `/api/orders/[id]/confirm` قبل حساب `bonuses`.

### بنية `commission_rule_snapshot`

```json
{
  "source": "user_override | category_rule | default",
  "seller_fixed_per_unit": 10,
  "seller_pct_overage": 40,
  "driver_fixed_per_delivery": 10,
  "captured_at": "2026-04-19T10:30:00+02:00"
}
```

يُبنى عند `POST /api/orders` عبر الخوارزمية:

```
1. user_row = user_bonus_rates WHERE user_id = :created_by
2. cat_row  = product_commission_rules WHERE category = :order_item.category
3. def_row  = settings.{seller_bonus_fixed, seller_bonus_percentage, driver_bonus_fixed}
4. merge: user → cat → def (user يتغلب عند وجود قيم)
5. INSERT order_items(..., commission_rule_snapshot = merged_json)
```

### أهلية العمولة

| الدور | عمولة بيع | عمولة توصيل | ملاحظة |
|-------|:---------:|:-----------:|--------|
| PM/GM/Manager | قابل للتكوين | قابل للتكوين | حسب الإعدادات (قرار M1) |
| Seller | ✅ | ❌ (افتراضي) | يكسب على مبيعاته |
| Driver | ❌ | ✅ | يكسب على توصيلاته |
| Stock Keeper | ❌ | ❌ | لا عمولات |

---

## صيغة عمولة البائع (لكل صنف)

تُقرأ الآن من الـ snapshot (D-17)، ليس من القواعد الحالية:

```
// من order_items:
actualPrice       = order_items.unit_price
recommendedPrice  = order_items.recommended_price  // snapshot من products.sell_price وقت الإنشاء
snapshot          = order_items.commission_rule_snapshot
sellerFixed       = snapshot.seller_fixed_per_unit
sellerPct         = snapshot.seller_pct_overage

// الحساب:
fixedTotal  = round2(sellerFixed × quantity)
extraMargin = max(0, actualPrice - recommendedPrice)
extraBonus  = round2(extraMargin × quantity × sellerPct / 100)
sellerBonus = round2(fixedTotal + extraBonus)
```

**ملاحظة**: تُحسب لكل `order_item` بشكل مستقل (BR-30). INSERT INTO bonuses يحصل لكل صنف منفصلاً.

---

## صيغة عمولة السائق (لكل توصيل)

```
// من snapshot الطلب (أي snapshot لـ order_item كافٍ — القيمة موحدة للطلب):
driverFixed = snapshot.driver_fixed_per_delivery
driverBonus = round2(driverFixed)
```

عمولة واحدة لكل توصيل (وليس لكل صنف). INSERT INTO bonuses صف واحد بـ `role='driver'`.

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

## الإلغاء والعمولات (شاشة C1 — D-18 محدَّث)

عند إلغاء طلب، لكل من البائع والسائق 3 خيارات مخزَّنة في `cancellations.seller_bonus_action` / `driver_bonus_action`:

| الـ action | حالة العمولة | النتيجة |
|------------|:------------:|---------|
| `keep` | أي حالة | `bonuses.status = 'retained'` — موجودة لكن مستبعدة من التسويات |
| `cancel_unpaid` | غير مصروفة (status='unsettled') | `bonuses.deleted_at = NOW()` — soft-delete |
| `cancel_as_debt` | مصروفة (status='settled') | INSERT settlement صف سالب (`amount = -total_bonus`) لاستهلاك من الدفعة التالية |

**الافتراضي (D-18)**:
- إذا لا توجد صفوف bonus للطلب: القيمة `cancel_unpaid` افتراضياً (UI يعرضها معطَّلة مع ملاحظة "لا عمولة").
- إذا يوجد صف bonus: **إلزامي، لا افتراضي**. POST بلا الـ action يُرد بـ 428 `BONUS_CHOICE_REQUIRED` مع preview.

---

## القيود

- `seller_percentage`: 0-100 (CHECK constraint — BR-34/M5)
- `seller_fixed ≥ 0`
- `driver_fixed ≥ 0`
- `bonuses.order_id = NOT NULL` دائماً (M12)
- `bonuses.order_item_id = NOT NULL` لعمولات seller. يمكن NULL لعمولة driver الموحَّدة.
- **UNIQUE**: `(delivery_id, role, order_item_id) WHERE deleted_at IS NULL` — عمولة واحدة لكل صنف لكل دور لكل توصيل (idempotency guard).
- عند الإلغاء، soft-delete فقط — لا DELETE فعلي (D-04).
