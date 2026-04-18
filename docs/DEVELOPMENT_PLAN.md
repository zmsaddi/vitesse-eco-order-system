# خطة التطوير — Development Plan v2

> **آخر تحديث**: 2026-04-18
> **الحالة**: معتمدة — قبل التنفيذ
> **النوع**: مشروع جديد بالكامل (لا ترحيل بيانات)
> **المواصفات**: docs/requirements-analysis/

---

## القرارات الأساسية

| القرار | التفصيل |
|--------|---------|
| البنية الحالية | **تُمسح بالكامل** — البدء من صفر نظيف |
| ما يبقى | docs/ + .git/ + .claude/ فقط |
| البيانات | مشروع جديد — لا ترحيل من v1 |
| التجارب | لا اختبار أثناء التطوير الأولي — أول نشر بعد اكتمال مرحلة كاملة |

---

## Stack التقني

| الطبقة | التقنية |
|--------|---------|
| Framework | Next.js 16 + TypeScript strict (App Router) |
| CSS | Tailwind CSS v4 + shadcn/ui |
| ORM | Drizzle ORM + @neondatabase/serverless |
| Validation | Zod v4 |
| Data Fetching | TanStack Query |
| State | Zustand (إشعارات + تفضيلات) |
| Real-time | SSE (مع polling fallback) |
| Auth | Auth.js v5 |
| Charts | Recharts |
| Voice | Groq (Whisper + Llama) |
| Deploy | Vercel Free + Neon Free |
| Images | Vercel Blob / Cloudinary Free |

---

## المراحل

### المرحلة 0: الأساس (Foundation)
**الهدف:** بنية المشروع من الصفر

**يُنفّذ:**
1. مسح الكود الحالي (الاحتفاظ بـ docs + .git + .claude)
2. إنشاء مشروع Next.js جديد مع TypeScript strict
3. تثبيت: Tailwind v4, shadcn/ui, Drizzle, TanStack Query, Zustand, Zod, Auth.js v5
4. إعداد Drizzle schema (كل ~36 جدول من 02_DB_Tree.md)
5. إعداد اتصال Neon + withTx
6. هيكل المجلدات src/ (modules, lib, components, voice, stores, providers, types)
7. إعداد: tsconfig, eslint, .env.local
8. إنشاء: money.ts, utils.ts, constants.ts

**المخرج:** مشروع فارغ يبني بدون أخطاء + schema جاهز
**التعقيد:** L

---

### المرحلة 1: المصادقة + Layout
**الهدف:** تسجيل دخول + هيكل عام + تنقل

**يُنفّذ:**
1. Auth.js v5 (CredentialsProvider + JWT + bcryptjs)
2. middleware.ts لحماية المسارات
3. 6 أدوار (pm/gm/manager/seller/driver/stock_keeper)
4. صفحة Login
5. AppLayout: Sidebar (drawer mobile / fixed desktop) + Topbar (breadcrumbs + bell placeholder + user menu)
6. Command Palette (Ctrl+K)
7. Sidebar مخصص حسب الدور
8. API: /api/auth, /api/health, /api/init (seed data)
9. Shell فارغ لكل مسار

**المخرج:** يمكن تسجيل الدخول ورؤية sidebar فارغ
**التعقيد:** M

---

### المرحلة 2: صفحات البيانات الأساسية
**الهدف:** المكونات المشتركة + الصفحات البسيطة

**يُنفّذ:**
1. **Design System Components:**
   - PageShell, DataTable (sort+filter+CSV+mobile cards), FormCard, SummaryCards
   - FilterBar, DetailDialog, ConfirmDialog, SmartSelect, ImageUpload
2. **المخزون + الكتالوج:**
   - /stock: جدول منتجات + أسعار + active/inactive + علامة هدايا
   - /stock/[id]: صفحة منتج (صور + مواصفات + وصف)
   - /catalog: PDF (3 لغات، بدون أسعار، فلتر المتاح)
   - رفع صور (Vercel Blob/Cloudinary)
   - /inventory: جرد دوري
3. **العملاء:** /clients + /clients/[id]
4. **الموردين:** /suppliers + /suppliers/[id]
5. **المستخدمين:** /users (6 أدوار)
6. **الإعدادات:** /settings + زر نسخ احتياطي
7. **API routes** لكل ما سبق
8. **Drizzle modules:** products, product_images, clients, suppliers, users, settings, inventory_counts

**المخرج:** 10 صفحات تعمل بالكامل مع CRUD
**التعقيد:** XL

---

### المرحلة 3: نظام الطلبات
**الهدف:** البيع المتعدد + العمولات + الهدايا + الخصومات

**يُنفّذ:**
1. orders + order_items (متعدد الأصناف)
2. product_commission_rules (عمولة حسب الفئة)
3. gift_pool + هدايا (is_gift + discount 100%)
4. خصومات مرنة (percent/fixed + حدود الدور)
5. VIN لكل صنف حسب category
6. /orders: نموذج متعدد + فلاتر + DataTable
7. شاشة إلغاء C1 (3 خيارات إلزامية)
8. /purchases: ترحيل + متوسط مرجح + شاشة C5
9. /expenses
10. API routes + Drizzle modules

**المخرج:** يمكن إنشاء طلب بـ 3 أصناف + هدية + خصم
**التعقيد:** XXL

---

### المرحلة 4: التوصيل + مهام السائق
**الهدف:** سير عمل التحضير + التوصيل + المهام

**يُنفّذ:**
1. /preparation: Stock Keeper يحضّر → جاهز
2. /deliveries: VIN لكل صنف + تأكيد → عمولات + فاتورة
3. /driver-tasks: بطاقات مهام (توصيل/جلب/تحصيل)
4. واجهة السائق: dashboard مهامي
5. واجهة Stock Keeper: dashboard تحضير
6. API routes + Drizzle modules

**المخرج:** سير عمل كامل من طلب → تحضير → توصيل → تأكيد
**التعقيد:** XL

---

### المرحلة 5: المالية + الصناديق + Dashboard
**الهدف:** الصناديق الهرمية + الفواتير + التسويات + لوحة التحكم

**يُنفّذ:**
1. treasury_accounts + treasury_movements (هيكل هرمي)
2. /treasury: أرصدة + حركات + تحويلات + تسوية يومية
3. /invoices: فاتورة متعددة الأصناف + PDF فرنسي + هدايا
4. /settlements: تسويات + مكافآت
5. /distributions: توزيع أرباح
6. /my-bonus: عمولتي مفصّلة حسب المنتج
7. /dashboard: 5 لوحات مخصصة حسب الدور
8. تقارير: P&L, أداء البائعين, ربح لكل طلب
9. ربط أموال السائق بالصندوق
10. API routes + Drizzle modules + Recharts

**المخرج:** نظام مالي كامل + dashboard لكل دور
**التعقيد:** XXL

---

### المرحلة 6: التنبيهات + الصلاحيات + سجل النشاطات
**الهدف:** الميزات المتقدمة

**يُنفّذ:**
1. SSE endpoint + notification bell + dropdown + /notifications
2. إشعارات حسب الدور + notification_preferences
3. activity_log + /activity
4. permissions table + can() + /permissions (مصفوفة تفاعلية)

**المخرج:** إشعارات فورية + سجل نشاطات + صلاحيات مرنة
**التعقيد:** XL

---

### المرحلة 7: النظام الصوتي + التلميع
**الهدف:** Voice + جودة

**يُنفّذ:**
1. Voice system بـ TypeScript (طلبات متعددة بالصوت)
2. Dark mode
3. حالات فارغة + اختصارات
4. طباعة فواتير
5. اختبارات Vitest

**المخرج:** نظام كامل جاهز للإنتاج
**التعقيد:** L

---

### المرحلة 8: تجهيز الموبايل
**الهدف:** PWA + React Native prep

**يُنفّذ:**
1. PWA manifest + service worker
2. Push notifications (Web Push API)
3. OpenAPI spec من Zod
4. API versioning (/api/v1/)

**المخرج:** التطبيق يُثبّت على الموبايل كـ PWA
**التعقيد:** M

---

## ملاحظات التنفيذ

- **لا ملف يتجاوز 300 سطر**
- **المرجع لأي سؤال:** docs/requirements-analysis/
- **القرارات المعتمدة:** 34 قرار في README.md (C1-C5, H1-H8, M1-M14, L1-L7)
- **القواعد التجارية:** 68 قاعدة في 09_Business_Rules.md (BR-01 إلى BR-68)
- **أول نشر إنتاجي:** بعد اكتمال المرحلة 5 على الأقل
