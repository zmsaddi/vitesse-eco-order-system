# البيانات المرجعية والقيم الثابتة — Reference Data & Lookup Values

> **رقم العنصر**: #5
> **المحور**: أ — الأساسيات والهيكل العام
> **الحالة**: مكتمل

---

## 1. حالات البيع — Sale Statuses

**الجدول**: `sales.status`
**القيمة الافتراضية**: `محجوز`

| القيمة | المعنى | اللون |
|--------|--------|-------|
| محجوز | بيع جديد بانتظار التأكيد | أصفر (#f59e0b) |
| مؤكد | بيع مؤكد جاهز للتسليم | أخضر (#16a34a) |
| ملغي | بيع ملغي | أحمر (#dc2626) |

---

## 2. حالات الدفع (المبيعات) — Sale Payment Statuses

**الجدول**: `sales.payment_status`
**القيمة الافتراضية**: `pending`
**قيد CHECK**: `IN ('pending','partial','paid','cancelled')`

| القيمة | المعنى |
|--------|--------|
| pending | لم يُستلم أي مبلغ |
| partial | مدفوع جزئيًا |
| paid | مدفوع بالكامل |
| cancelled | ملغي |

---

## 3. طرق الدفع — Payment Types

**الجداول**: `sales.payment_type`, `purchases.payment_type`, `expenses.payment_type`, `invoices.payment_type`, `supplier_payments.payment_method`, `payments.payment_method`
**القيمة الافتراضية**: `كاش`

| القيمة | المعنى | أين تُستخدم | أسماء بديلة (صوتي) |
|--------|--------|-------------|-------------------|
| كاش | دفع نقدي | الكل | نقدي، نقد، cash |
| بنك | تحويل بنكي | الكل | تحويل، حوالة، bank |
| آجل | دفع مؤجل | المبيعات فقط | دين، بعدين، على الحساب، credit |

**قيد CHECK على payments**: `payment_method IN ('كاش','بنك')`
**ملاحظة**: آجل متاح فقط في المبيعات — المشتريات والمصاريف والدفعات تقبل كاش/بنك فقط

---

## 4. حالات التوصيل — Delivery Statuses

**الجدول**: `deliveries.status`
**القيمة الافتراضية**: `قيد الانتظار`

| القيمة | المعنى | اللون | الخلفية |
|--------|--------|-------|---------|
| قيد الانتظار | بانتظار التعيين أو البدء | #f59e0b | #fef3c7 |
| جاري التوصيل | السائق في الطريق | #3b82f6 | #dbeafe |
| تم التوصيل | تم التسليم بنجاح | #16a34a | #dcfce7 |
| ملغي | توصيل ملغي | #dc2626 | #fee2e2 |

**كشف VIN**: مطلوب تلقائيًا عند اكتشاف كلمات: bike, دراجة, ebike, e-bike, scooter, sur-ron, aperyder

---

## 5. حالات دفع المشتريات — Purchase Payment Statuses

**الجدول**: `purchases.payment_status`
**القيمة الافتراضية**: `paid`

| القيمة | المعنى |
|--------|--------|
| paid | مدفوع بالكامل للمورد |
| partial | مدفوع جزئيًا |
| pending | لم يُدفع بعد |

---

## 6. أنواع الدفعات — Payment Collection Types

**الجدول**: `payments.type`
**القيمة الافتراضية**: `collection`
**قيد CHECK**: `IN ('collection','refund','advance')`

| القيمة | المعنى |
|--------|--------|
| collection | دفعة مستلمة من العميل |
| refund | مبلغ مُعاد للعميل |
| advance | دفعة مسبقة |

---

## 7. أدوار المستخدمين — User Roles

**الجدول**: `users.role`
**القيمة الافتراضية**: `seller`

| القيمة | التسمية العربية | اللون |
|--------|----------------|-------|
| admin | مدير عام | أحمر (#dc2626) |
| manager | مشرف | أزرق (#1e40af) |
| seller | بائع | أخضر (#16a34a) |
| driver | سائق | بنفسجي (#7c3aed) |

---

## 8. فئات المصاريف — Expense Categories

**المصدر**: `lib/utils.js` (EXPENSE_CATEGORIES)
**الجدول**: `expenses.category`

| القيمة | المقابل الإنجليزي |
|--------|------------------|
| إيجار | Rent |
| رواتب | Salaries |
| نقل وشحن | Transport & Shipping |
| صيانة وإصلاح | Maintenance & Repair |
| تسويق وإعلان | Marketing & Advertising |
| كهرباء وماء | Electricity & Water |
| تأمين | Insurance |
| أدوات ومعدات | Tools & Equipment |
| أخرى | Other |

---

## 9. فئات المنتجات — Product Categories

**المصدر**: `lib/utils.js` (PRODUCT_CATEGORIES)
**الجدول**: `products.category`

| القيمة |
|--------|
| دراجات كهربائية |
| دراجات عادية |
| إكسسوارات |
| قطع تبديل |
| بطاريات |
| شواحن |
| أخرى |

---

## 10. أنواع التسوية — Settlement Types

**الجدول**: `settlements.type`

| القيمة | التسمية العربية | المعنى |
|--------|----------------|--------|
| seller_payout | دفع عمولة بائع | صرف عمولة لبائع |
| driver_payout | دفع عمولة سائق | صرف عمولة لسائق |
| profit_distribution | توزيع أرباح | توزيع حصص أرباح (للقراءة فقط — تم نقله إلى /profit-distributions) |

**النماذج الجديدة**: فقط seller_payout و driver_payout متاحان للإنشاء

---

## 11. حالات الفاتورة — Invoice Statuses

**الجدول**: `invoices.status`
**القيمة الافتراضية**: `مؤكد`

| القيمة | المعنى |
|--------|--------|
| مؤكد | فاتورة صالحة |
| ملغي | فاتورة ملغية |

---

## 12. أوضاع إلغاء الفاتورة — Cancellation Invoice Modes

**الجدول**: `cancellations.invoice_mode`
**قيد CHECK**: `IN ('soft','delete')`

| القيمة | المعنى |
|--------|--------|
| soft | إلغاء ناعم — تحديث حالة الفاتورة إلى 'ملغي' (يحافظ على السجل) |
| delete | حذف كامل — إزالة الفاتورة نهائيًا |

---

## 13. حالات السجل الصوتي — Voice Log Statuses

**الجدول**: `voice_logs.status`
**القيمة الافتراضية**: `pending`

| القيمة | المعنى |
|--------|--------|
| pending | بانتظار المعالجة |
| completed | تمت المعالجة وتم الربط بـ action_id |

---

## 14. مصادر الأسماء المستعارة — Entity Alias Sources

**الجدول**: `entity_aliases.source`
**القيمة الافتراضية**: `user`

| القيمة | المعنى |
|--------|--------|
| user | تم تعلمه من تصحيحات المستخدم |
| seed | بيانات مبدئية محضّرة مسبقًا |

---

## 15. أنواع الإجراءات الصوتية — Voice Action Types

**المصدر**: `/api/voice/process/route.js`

| القيمة | المعنى | الأدوار المسموحة |
|--------|--------|-----------------|
| register_sale | تسجيل بيع | admin, manager, seller |
| register_purchase | تسجيل مشترى | admin, manager |
| register_expense | تسجيل مصروف | admin, manager |
| clarification | طلب توضيح من المستخدم | الكل |

---

## 16. إعدادات النظام الافتراضية — Default Settings

**الجدول**: `settings`

### بيانات الشركة

| المفتاح | القيمة الافتراضية |
|---------|-------------------|
| shop_name | VITESSE ECO SAS |
| shop_legal_form | SAS |
| shop_siren | 100 732 247 |
| shop_siret | 100 732 247 00018 |
| shop_ape | 46.90Z |
| shop_address | 32 Rue du Faubourg du Pont Neuf |
| shop_city | 86000 Poitiers, France |
| shop_email | contact@vitesse-eco.fr |
| shop_website | www.vitesse-eco.fr |
| shop_vat_number | FR -- (placeholder) |
| shop_iban | FR -- (placeholder) |
| shop_bic | (placeholder) |

### إعدادات مالية

| المفتاح | القيمة | النوع |
|---------|--------|-------|
| vat_rate | 20 | نسبة مئوية |
| invoice_currency | EUR | عملة |

### إعدادات العمولات

| المفتاح | القيمة | النوع |
|---------|--------|-------|
| seller_bonus_fixed | 10 | عمولة ثابتة بالـ EUR |
| seller_bonus_percentage | 50 | نسبة من فرق السعر |
| driver_bonus_fixed | 5 | عمولة ثابتة بالـ EUR |

---

## 17. خرائط التحويل الصوتي — Voice Mapping Tables

### خريطة طرق الدفع (PAYMENT_MAP)

| المدخل | القيمة المعيارية |
|--------|-----------------|
| cash | كاش |
| bank | بنك |
| credit | آجل |
| نقدي | كاش |
| نقد | كاش |
| تحويل | بنك |
| حوالة | بنك |
| دين | آجل |
| بعدين | آجل |
| على الحساب | آجل |

### خريطة فئات المصاريف (CATEGORY_MAP)

| المدخل | القيمة المعيارية |
|--------|-----------------|
| rent | إيجار |
| salaries | رواتب |
| transport | نقل وشحن |
| maintenance | صيانة وإصلاح |
| marketing | تسويق وإعلان |
| utilities | كهرباء وماء |
| insurance | تأمين |
| tools | أدوات ومعدات |
| other | أخرى |
