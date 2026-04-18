# ملاحظات الأداء — Performance & Scalability Notes

> **رقم العنصر**: #35 | **المحور**: ح | **الحالة**: مكتمل

---

## 1. الاستعلامات الثقيلة

| الاستعلام | الصفحة | التأثير |
|-----------|--------|---------|
| getSummaryData() | /summary | تجميع من 7 جداول (sales, purchases, payments, expenses, deliveries, clients, suppliers) |
| المتوسط المرجح | /purchases (POST) | حساب مع كل مشترى جديد |
| FIFO walker | /clients/[id]/collect | يمشي على جميع المبيعات المفتوحة |
| Bonus calculation | /deliveries (PUT) | حساب عمولتين + إنشاء فاتورة في معاملة واحدة |

---

## 2. الفهارس الموجودة

### فهارس التفرد
- `users.username` (UNIQUE)
- `products.name` (UNIQUE)
- `purchases/sales/deliveries/invoices.ref_code` (UNIQUE جزئي)
- `clients.(name,phone)` و `clients.(name,email)` (UNIQUE جزئي)
- `suppliers.(name,phone)` (UNIQUE جزئي)
- `bonuses.(delivery_id,role)` (UNIQUE)
- `entity_aliases.(entity_type,normalized_alias)` (UNIQUE)

### فهارس الأداء
- `sales.payment_status` — فلترة حالة الدفع
- `supplier_payments.purchase_id` — بحث بالمشترى
- `profit_distributions.group_id` — تجميع التوزيعات
- `profit_distributions.username` — بحث بالمستلم
- `profit_distributions.created_at DESC` — ترتيب الأحدث
- `cancellations.sale_id` — بحث بالبيع

---

## 3. Connection Pooling

- **المزود**: Neon Serverless عبر @vercel/postgres
- **الآلية**: Neon proxy يدير connection pooling
- **POSTGRES_URL**: اتصال مع pooling (للاستعلامات العادية)
- **POSTGRES_URL_NON_POOLING**: اتصال مباشر (للمعاملات الطويلة)

---

## 4. الدقة العددية

- **النوع**: NUMERIC(19,2) بدل REAL/FLOAT
- **السبب**: تجنب أخطاء التقريب في التجميعات المالية
- **التأثير**: أبطأ قليلًا من FLOAT لكن دقيق 100%
- **تسامح المقارنة**: 0.01€ (سنت واحد) — موحد في كل مكان

---

## 5. حدود Vercel

| الحد | القيمة |
|------|--------|
| وقت تنفيذ الدالة | حسب الخطة (10-60 ثانية) |
| حجم الطلب | محدود (voice: 10MB max) |
| Cold Start | ممكن في كل طلب (serverless) |
| Rate Limit (voice) | 10/دقيقة (in-memory، يُمسح عند cold start) |

---

## 6. التخزين المؤقت

| الآلية | الاستخدام | المدة |
|--------|----------|-------|
| GlobalSearch cache | كيانات البحث الشامل | 2 دقيقة |
| Fuse.js index cache | entity resolution للصوت | حتى إبطال |
| useAutoRefresh | تحديث دوري للبيانات | حسب الإعداد |

---

## 7. لا يوجد CDN أو Redis

- لا توجد طبقة تخزين مؤقت خارجية
- جميع الاستعلامات تذهب مباشرة لقاعدة البيانات
- التخزين المؤقت client-side فقط
