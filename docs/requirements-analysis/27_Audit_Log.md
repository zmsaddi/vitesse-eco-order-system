# سجل التدقيق — Audit Log

> **رقم العنصر**: #26 | **المحور**: هـ | **الحالة**: مكتمل

---

## 1. أعمدة التدقيق المشتركة (created_by / updated_by / updated_at)

### الجداول التي تسجل created_by
| الجدول | العمود | القيمة |
|--------|--------|--------|
| purchases | created_by | username المنشئ |
| sales | created_by | username المنشئ |
| deliveries | created_by | username المنشئ |
| payments | created_by | username المنشئ |
| expenses | created_by | username المنشئ |
| clients | created_by | username المنشئ |
| products | created_by | username المنشئ |
| supplier_payments | created_by | username المنشئ |
| profit_distributions | created_by | username المنشئ |
| settlements | settled_by | username المنفذ |

### الجداول التي تسجل updated_by + updated_at
- sales, clients, products, purchases, expenses, deliveries, payments, invoices, suppliers, settlements, profit_distributions
- **النمط**: `updated_by = username, updated_at = NOW()`
- **متى**: فقط عند تعديل صريح من المستخدم (ليس تحديثات النظام التلقائية)

---

## 2. جدول الإلغاءات (cancellations)

سجل تدقيق مفصل لكل عملية إلغاء بيع:

| العمود | المحتوى |
|--------|---------|
| sale_id | رقم البيع الملغي |
| cancelled_by | username المدير الذي ألغى |
| cancelled_at | وقت الإلغاء (TIMESTAMPTZ) |
| reason | سبب الإلغاء (نص مطلوب) |
| refund_amount | مبلغ الاسترداد |
| delivery_status_before | حالة التوصيل قبل الإلغاء |
| bonus_status_before | حالة العمولة قبل الإلغاء |
| invoice_mode | 'soft' أو 'delete' |
| seller_bonus_kept | هل أُبقيت عمولة البائع؟ |
| driver_bonus_kept | هل أُبقيت عمولة السائق؟ |
| notes | ملاحظات إضافية |

---

## 3. سجل تغيير الأسعار (price_history)

يُسجل عند كل تغيير في أسعار المنتجات:

| العمود | المحتوى |
|--------|---------|
| product_name | اسم المنتج |
| old_buy_price | سعر الشراء القديم |
| new_buy_price | سعر الشراء الجديد |
| old_sell_price | سعر البيع القديم |
| new_sell_price | سعر البيع الجديد |
| purchase_id | رقم المشترى المرتبط (إن وُجد) |
| changed_by | username من غيّر السعر |

**المحفزات**: إضافة مشترى، حذف مشترى (changed_by='reversal')، تعديل المنتج

---

## 4. سجل دفعات الموردين (supplier_payments)

كل دفعة جزئية أو كاملة للمورد:

| العمود | المحتوى |
|--------|---------|
| purchase_id | رقم المشترى |
| date | تاريخ الدفعة |
| amount | المبلغ المدفوع |
| payment_method | كاش أو بنك |
| notes | ملاحظات |
| created_by | username المنفذ |
| created_at | وقت الإنشاء |

---

## 5. سجل العمولات (bonuses)

يحتفظ بتفاصيل حساب كل عمولة:

| العمود | المحتوى |
|--------|---------|
| username | المستفيد |
| role | seller أو driver |
| sale_id / delivery_id | المرتبطان |
| recommended_price / actual_price | الأسعار المستخدمة في الحساب |
| fixed_bonus / extra_bonus / total_bonus | تفاصيل الحساب |
| settled | هل صُرفت؟ |
| settlement_id | رقم التسوية (إن صُرفت) |

---

## 6. لا يوجد Activity Log عام

- النظام لا يحتوي على جدول activity_log مركزي
- التدقيق موزع عبر الجداول المتخصصة أعلاه
- لا تسجيل لعمليات القراءة (GET)
- لا تسجيل لعمليات تسجيل الدخول/الخروج
