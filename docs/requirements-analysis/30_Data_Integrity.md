# سلامة البيانات — Data Integrity

> **رقم العنصر**: #30 | **المحور**: و | **الحالة**: قيد التحديث

---

## سياسة الحذف الناعم (قرار H5)

| الكيان | الحذف | البديل |
|--------|:-----:|--------|
| الطلبات | ❌ | status = 'ملغي' |
| التوصيلات | ❌ | status = 'ملغي' |
| الفواتير | ❌ | status = 'ملغي' (BR-65) |
| المنتجات | ❌ | active = false (BR-06/H6) |
| المستخدمين | ❌ | active = false (BR-43) |
| الموردين | ❌ إذا مشتريات | ❌ (BR-14) |
| العملاء | ❌ إذا طلبات | ❌ (BR-13) |
| المشتريات | ✅ حذف (مع شاشة C5) | — |
| المصاريف | ✅ حذف | — |

## Foreign Keys — ON DELETE

- **RESTRICT** (الأغلبية): لأن الحذف ناعم — لا CASCADE مطلوب
- **CASCADE**: product_images (مع المنتج)، order_items (مع الطلب)، notification_preferences (مع المستخدم)
- **SET NULL**: payments.order_id (الدفعة تبقى حتى لو الطلب أُلغي)

## تحديث أسماء الكيانات (قرار H4/BR-49)

عند تغيير اسم عميل/مورد/منتج → تحديث شامل ذري (withTx) لكل المراجع النصية:
- orders.client_name, deliveries.client_name
- purchases.supplier
- order_items.product_name, price_history.product_name
- إلخ
