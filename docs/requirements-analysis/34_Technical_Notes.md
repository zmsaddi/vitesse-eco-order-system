# الملاحظات التقنية — Technical Notes & Assumptions

> **رقم العنصر**: #33 | **المحور**: ح | **الحالة**: مكتمل

---

## 1. NUMERIC يُرجع كـ STRING

- **المشكلة**: @vercel/postgres يُرجع أعمدة NUMERIC(19,2) كـ string
- **الخطر**: `"5.00" + "3.00"` = `"5.003.00"` بدل `8.00`
- **الحل**: `parseFloat()` قبل أي عملية حسابية — يُفضل helper مركزي
- **التأثير**: جميع أعمدة المال والكميات
- **الدقة المعتمدة**: 0.01€ — جميع المقارنات والتقريب والأرصدة بمنزلتين عشريتين (BR-38)

---

## 2. التواريخ TEXT وليست DATE

- **التنسيق**: ISO 8601 TEXT (YYYY-MM-DD)
- **السبب**: بساطة التخزين والمقارنة
- **الأثر**: لا يوجد تحقق على مستوى قاعدة البيانات لصحة التاريخ
- **التحقق**: Zod schema يتحقق من الصيغة

---

## 3. العلاقات النصية (TEXT References)

بعض العلاقات بين الجداول عبر اسم نصي وليس FK:

| من | إلى | المرجع |
|----|-----|--------|
| purchases.supplier | suppliers.name | نص |
| sales.client_name | clients.name | نص |
| bonuses.username | users.username | نص |
| price_history.product_name | products.name | نص |

**الأثر**: لا cascading تلقائي — إذا تغير اسم المنتج/العميل/المورد، السجلات القديمة تحتفظ بالاسم القديم

---

## 4. Next.js App Router

- **الإصدار**: Next.js مع App Router (app/ directory)
- **API Routes**: Route Handlers (app/api/*/route.js)
- **الصفحات**: Client Components (use client)
- **التنسيق**: CSS Modules + Tailwind-like inline styles

---

## 5. اتجاه RTL

- **الافتراضي**: من اليمين لليسار (RTL)
- **استثناءات LTR**: حقول الهاتف، الإيميل، VIN، الأسماء اللاتينية
- **VIN Input**: CSS `text-transform: uppercase` بدل JS (لمنع قفز المؤشر على الموبايل)

---

## 6. Serverless Constraints

- **Cold Start**: كل طلب قد يبدأ من الصفر
- **Rate Limit Map**: في الذاكرة — يُمسح عند cold start
- **Connection Pool**: Neon يدير pooling عبر proxy
- **Timeout**: حدود Vercel على وقت التنفيذ

---

## 7. الترحيل (Migrations)

- **النمط**: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idempotent)
- **الآمان**: يمكن تشغيلها عدة مرات بدون أثر جانبي
- **المساعد**: `ignoreExpectedDdl()` يبتلع الأخطاء المتوقعة (عمود موجود مسبقًا)
- **التشغيل**: عند أول طلب (initDatabase) أو عبر GET /api/init

---

## 8. البذور الأولية (Seed Data)

- **المستخدم الافتراضي**: admin / admin123 (يجب تغييره بعد التثبيت)
- **أسماء المنتجات المستعارة**: 10+ منتجات مع أسماء عربية مبدئية
- **الإعدادات**: بيانات الشركة + نسب العمولات + TVA
