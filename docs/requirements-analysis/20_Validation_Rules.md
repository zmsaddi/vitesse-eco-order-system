# قواعد التحقق — Validation Rules

> **رقم العنصر**: #20 | **المحور**: د | **الحالة**: مواصفات نهائية

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
| orders | status IN ('محجوز','قيد التحضير','جاهز','مؤكد','ملغي') (D-03) |
| orders | payment_method IN ('كاش','بنك','آجل') |
| orders | payment_status IN ('pending','partial','paid','cancelled') |
| deliveries | status IN ('قيد الانتظار','قيد التحضير','جاهز','جاري التوصيل','تم التوصيل','ملغي') (D-03) |
| payments | type IN ('collection','refund','advance') |
| payments | payment_method IN ('كاش','بنك') |
| user_bonus_rates | seller_percentage 0-100, seller_fixed ≥ 0, driver_fixed ≥ 0 |
| driver_tasks | related_entity_type IN ('order','supplier_purchase','client_collection','other') (D-21) |
| notification_preferences | channel IN ('in_app') — MVP (D-22) |
| cancellations | seller_bonus_action/driver_bonus_action IN ('keep','cancel_unpaid','cancel_as_debt') (D-18) |
| treasury_movements | category **بدون** `supplier_credit` — يُدار في `suppliers.credit_due_from_supplier` (D-10) |
| bonuses | role IN ('seller','driver') + UNIQUE (delivery_id, role, order_item_id) partial |
| أنواع التاريخ | DATE / TIMESTAMPTZ (ليس TEXT) — قرار M4 |

## تحقق على مستوى الأعمال (في الكود)

- FOR UPDATE lock قبل خصم المخزون (BR-04).
- تعيين سائق اختياري (BR-23).
- VIN مطلوب إذا `order_item.category` في `settings.vin_required_categories` (D-03 + BR-21).
- **FK IDs** (D-20) — name-change لا يُغيِّر `*_name_cached` في السجلات التاريخية.
- **idempotency** على mutations حرجة (D-16).
- **سقف الخصم الإجمالي** (Report 1 M11): مجموع خصومات order items ≤ 5% لـ seller / 15% لـ manager (قاعدة إجمالية، ليس per-item فقط).
- **Phone format**: Zod regex E.164 `^\+?[1-9]\d{6,14}$`.
- **Email**: Zod `.email()` standard.
- **IBAN/BIC** في settings: لا تقبل placeholder (`à compléter`) عند PUT — تُرد بـ 400.
- **SKU limit** (D-25): `POST /api/products` يرفض إذا `COUNT(products WHERE active=true) >= settings.sku_limit`.
- **Image count** (D-25): `POST /api/products/[id]/images` يرفض إذا `COUNT(product_images WHERE product_id=:id) >= 3`.
- **RTL override characters**: U+202E / U+202D / U+200E / U+200F تُرفض من حقول الأسماء (Zod refine).
