# قواعد توزيع الأرباح — Profit Distribution Rules

> **رقم العنصر**: #14 | **المحور**: ب | **الحالة**: مواصفات نهائية

---

## من يوزِّع؟

PM/GM فقط (POST على `/api/distributions`).

## من يستلم؟

المستخدمون بدور `pm | gm | manager` الذين لديهم:
- `active = true`
- `profit_share_pct > 0`
- `profit_share_start ≤ base_period_start`

---

## الصيغة

### Distributable pool per period (D-06 + D-08)

```sql
-- D-06: الإيرادات من payments موقَّعة
collected_net = SUM(payments.amount)
                WHERE type IN ('collection','refund','advance')
                AND date BETWEEN :start AND :end
                AND payments.deleted_at IS NULL
                AND EXISTS (SELECT 1 FROM orders
                            WHERE orders.id = payments.order_id
                            AND orders.status != 'ملغي'
                            AND orders.deleted_at IS NULL)
-- refund موقَّع سالب → يُنقِص collected_net تلقائياً

-- D-08: COGS (ليس purchases.total)
cogs_sold = SUM(order_items.cost_price × order_items.quantity)
            JOIN orders ON order_items.order_id = orders.id
            WHERE orders.status = 'مؤكد'
            AND orders.confirmation_date BETWEEN :start AND :end
            AND order_items.is_gift = false
            AND order_items.deleted_at IS NULL
            AND orders.deleted_at IS NULL

gifts_cost = SUM(order_items.cost_price × order_items.quantity)
             JOIN orders ON order_items.order_id = orders.id
             WHERE orders.status = 'مؤكد'
             AND orders.confirmation_date BETWEEN :start AND :end
             AND order_items.is_gift = true
             AND order_items.deleted_at IS NULL

expenses = SUM(expenses.amount) WHERE date BETWEEN :start AND :end AND deleted_at IS NULL
bonuses  = SUM(bonuses.total_bonus) WHERE date BETWEEN :start AND :end AND deleted_at IS NULL
rewards  = SUM(settlements.amount)
           WHERE type = 'reward'
           AND date BETWEEN :start AND :end
           AND deleted_at IS NULL

net_profit = collected_net - cogs_sold - gifts_cost - expenses - bonuses - rewards

previously_distributed = SUM(profit_distributions.amount)
                         WHERE base_period_start = :start
                         AND base_period_end = :end
                         AND deleted_at IS NULL

distributable = round2(net_profit - previously_distributed)
```

**ملاحظات حاكمة**:
- `collected_net` يدمج collection + refund (سالب) + advance — موقَّع (D-06).
- `cogs_sold` و`gifts_cost` **منفصلان** (D-07 — لا خصم مكرَّر).
- `cogs_sold` من `order_items.cost_price × qty` (snapshot cost وقت البيع)، ليس من `purchases.total` (D-08).

### لكل مستلم

```
amount = round2(distributable × percentage / 100)
```

---

## القواعد الحاكمة

| # | القاعدة |
|---|---------|
| 1 | كل فترة تُوزَّع **مرة واحدة فقط** — enforced بـ UNIQUE index على `(base_period_start, base_period_end) WHERE both NOT NULL` + advisory lock |
| 1b | **فترات غير متداخلة (D-54)** — قبل INSERT في `profit_distribution_groups`، فحص تداخل مع فترات موجودة. إذا > 0 → 409 `OVERLAPPING_PERIOD`. |
| 2 | مجموع النسب **= 100%** (±0.01% tolerance) — validate قبل الإدراج |
| 3 | لا يمكن توزيع أكثر من `distributable` — validate داخل الـ transaction |
| 4 | `created_by` إلزامي — H8 |
| 5 | التكلفة = **COGS** (ليس purchases.total) + مصاريف + عمولات + تكلفة هدايا + مكافآت. COGS = `SUM(order_items.cost_price × qty)` للأصناف المبيعة في الفترة مع `status='مؤكد'` (D-08). تكلفة الهدايا منفصلة عن COGS (D-07). |
| 6 | الإيرادات = المحصَّل فعلياً (**cash basis**، ليس accrual) |
| 7 | كل توزيع → حركة `treasury_movements` type='outflow' category='profit_distribution' |
| 8 | المستخدم المعطَّل (`active=false`) مع `profit_share_pct > 0` — يُستبعَد من التوزيعات الجديدة؛ التوزيعات السابقة تبقى |

---

## منع السباقات (Race Conditions)

داخل الـ transaction:

```sql
-- الحدود timezone-safe (Europe/Paris):
:start_utc = (:start AT TIME ZONE 'Europe/Paris')::timestamptz
:end_utc   = ((:end + INTERVAL '1 day') AT TIME ZONE 'Europe/Paris')::timestamptz

-- قفل على مفتاح الفترة لمنع التوزيع المتزامن
SELECT pg_advisory_xact_lock(hashtext('profit_distribution:' || :start || ':' || :end));

-- D-54: فحص تداخل مع فترات موجودة
SELECT COUNT(*) INTO :overlap_count
FROM profit_distribution_groups
WHERE base_period_start <= :end
  AND base_period_end >= :start
  AND deleted_at IS NULL;

IF :overlap_count > 0 THEN
  RAISE EXCEPTION 'فترة التوزيع متداخلة مع فترة موجودة' USING ERRCODE = 'P0001';
  -- → 409 OVERLAPPING_PERIOD في API handler
END IF;

-- إعادة حساب distributable داخل القفل (يستخدم الحدود UTC أعلاه)
SELECT calculate_distributable(:start_utc, :end_utc) INTO :pool;

-- التحقق من عدم تجاوز pool
IF :sum_of_amounts > :pool + 0.01 THEN
  RAISE EXCEPTION 'المبلغ يتجاوز المتاح للتوزيع';
END IF;

-- إدراج الصفوف (كلها داخل withTx — atomicity D-05)
INSERT INTO profit_distribution_groups ...;
INSERT INTO profit_distributions ... (for each recipient);
INSERT INTO treasury_movements ... (for each recipient);
INSERT INTO activity_log ...;
```

Advisory lock يُحرَّر تلقائياً عند COMMIT أو ROLLBACK.

---

## UI flow

صفحة `/distributions`:

1. اختيار الفترة (start, end).
2. النظام يحسب الـ `distributable` ويعرضه.
3. تحميل قائمة المستلمين الحاليين مع نسبهم من `getProfitShareConfig()`.
4. إدخال نسب (قابلة للتعديل؛ المجموع يجب = 100% — validation real-time).
5. معاينة: مبلغ كل مستلم.
6. تأكيد → POST `/api/distributions` → transaction.
7. فشل (تجاوز cap) → toast أحمر + إبقاء النموذج.
8. نجاح → redirect إلى سجل التوزيعات + toast أخضر.

---

## حالات خاصة

| الحالة | المعالجة |
|--------|----------|
| لا مستلمين مؤهلين | خطأ: "لا يوجد مستلمون مؤهلون للفترة" |
| pool = 0 | خطأ: "لا أرباح للتوزيع في هذه الفترة" |
| مجموع النسب ≠ 100% | validation error قبل الإرسال |
| إلغاء طلب سابق ضمن الفترة | `distributable` يُعاد حسابه ديناميكياً — قد يُنتج فرقاً لاحقاً |
| تعديل `profit_share_pct` في منتصف الفترة | يُعتمد الـ pct **لحظة التوزيع** (snapshot في `profit_distributions.percentage`) |
