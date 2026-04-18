# قواعد توزيع الأرباح — Profit Distribution Rules

> **رقم العنصر**: #14 | **المحور**: ب | **الحالة**: قيد التحديث

---

## من يوزّع؟
PM/GM فقط.

## من يستلم؟
المستخدمون بدور pm أو gm أو manager الذين لديهم profit_share_pct > 0 و profit_share_start ≤ بداية الفترة.

## الصيغة

```
distributableProfit = netProfit(cash basis) - previouslyDistributed

// لكل مستلم:
amount = round2(distributableProfit × percentage / 100)

// مجموع النسب يجب = 100% (±0.01%)
```

## القواعد

| # | القاعدة |
|---|---------|
| 1 | كل فترة تُوزّع مرة واحدة فقط — UNIQUE (start, end) — قرار L5 |
| 2 | النسب يجب أن تكون = 100% (BR-60) |
| 3 | لا يمكن توزيع أكثر من المتاح |
| 4 | created_by إلزامي (BR-61/H8) |
| 5 | التكلفة تشمل: مشتريات + مصاريف + عمولات + هدايا + مكافآت |
| 6 | الإيرادات = المحصّل فعلياً (cash basis) |
| 7 | حركة treasury: outflow لكل مستلم |

## المستخدم المعطّل

إذا المستخدم معطّل (active=false) لكن لديه profit_share_pct > 0 ← **يُستبعد** من التوزيعات الجديدة. التوزيعات السابقة تبقى.
