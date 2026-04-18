# قواعد التحقق — Validation Rules

> **رقم العنصر**: #20 | **المحور**: د | **الحالة**: قيد التحديث

---

## تحقق على مستوى النموذج (Zod v4)

| النموذج | القاعدة |
|---------|--------|
| الطلب | عميل مطلوب، ≥1 صنف، كمية > 0، سعر ≥ buy_price (BR-01)، seller: سعر ≥ sell_price (BR-02) |
| صنف الطلب | منتج مطلوب، كمية ≤ المتاح، سعر > 0 |
| خصم | percent: 0-100، fixed: ≤ lineTotal، حسب حد الدور (BR-41) |
| هدية | المنتج في gift_pool + remaining > 0 |
| المشتريات | مورد مطلوب، منتج مطلوب، كمية > 0، سعر > 0 |
| المصاريف | فئة مطلوبة، وصف مطلوب، مبلغ > 0 |
| تحصيل | مبلغ > 0 وَ ≤ remaining + 0.01€ (BR-09)، طلب مؤكد (BR-10) |
| المستخدم | username فريد، name مطلوب، role من 6 قيم |
| التسوية | مبلغ > 0 وَ ≤ availableCredit |
| التوزيع | مجموع النسب = 100% (±0.01%)، المبلغ ≤ distributableProfit |

## تحقق على مستوى قاعدة البيانات (CHECK + UNIQUE)

| الجدول | القيد |
|--------|------|
| users | role IN ('pm','gm','manager','seller','driver','stock_keeper') |
| orders | status IN ('محجوز','قيد_التحضير','جاهز','مؤكد','ملغي') |
| orders | payment_method IN ('كاش','بنك','آجل') |
| orders | payment_status IN ('pending','partial','paid','cancelled') |
| payments | type IN ('collection','refund','advance') |
| payments | payment_method IN ('كاش','بنك') |
| user_bonus_rates | seller_percentage 0-100, seller_fixed ≥ 0, driver_fixed ≥ 0 |
| أنواع التاريخ | DATE / TIMESTAMPTZ (ليس TEXT) — قرار M4 |

## تحقق على مستوى الأعمال (في الكود)

- FOR UPDATE lock قبل خصم المخزون (BR-04)
- تعيين سائق اختياري (BR-23)
- VIN حسب فئة المنتج category (BR-21/L1)
- تحديث ذري عند تغيير اسم كيان (BR-49/H4)
