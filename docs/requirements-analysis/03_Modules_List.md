# قائمة الوحدات والصفحات — Modules & Pages List

> **رقم العنصر**: #03 | **المحور**: أ | **الحالة**: قيد التحديث

---

## ملخص

النظام يتكون من **25 صفحة** موزعة على **4 أنماط** و **6 مجموعات تنقل**. كل صفحة تتبع نمطاً موحداً يضمن تجربة متسقة.

---

## أنماط الصفحات (4 أنماط)

| النمط | الوصف | يُستخدم في |
|-------|-------|-----------|
| **نمط 1: CRUD** | قائمة + نموذج قابل للطي + فلاتر + جدول/بطاقات + pagination | معظم الصفحات |
| **نمط 2: تفاصيل** | بطاقة معلومات + تبويبات (سجلات، دفعات، نشاط) | تفاصيل عميل/مورد/منتج |
| **نمط 3: Dashboard** | بطاقات KPI + تبويبات (ملخص، تقارير، أرصدة) + charts | لوحة التحكم |
| **نمط 4: مهام** | بطاقات مهام + ملخص حالات + إجراءات سريعة | مهام السائق/أمين المخزن |

---

## هيكل التنقل (Sidebar Groups)

```
├── لوحة التحكم (بدون مجموعة)
│
├── عمليات
│   ├── الطلبات (Orders)
│   ├── المشتريات (Purchases)
│   ├── المصاريف (Expenses)
│   ├── التوصيل (Deliveries)
│   └── مهام السائق (Driver Tasks) ← جديد
│
├── مالية
│   ├── الفواتير (Invoices)
│   ├── الصندوق (Treasury) ← جديد
│   ├── التسويات (Settlements)
│   └── توزيع الأرباح (Profit Distributions)
│
├── بيانات
│   ├── المخزون (Stock)
│   ├── الكتالوج (Catalog) ← جديد
│   ├── العملاء (Clients)
│   ├── الموردين (Suppliers)
│   ├── الجرد (Inventory Counts) ← جديد
│   └── عمولتي (My Bonus)
│
├── نظام
│   ├── المستخدمين (Users)
│   ├── الإعدادات (Settings)
│   ├── الصلاحيات (Permissions) ← جديد
│   ├── سجل النشاطات (Activity Log) ← جديد
│   └── الإشعارات (Notifications) ← جديد
│
└── تحضير الطلبات (Preparation) ← جديد (Stock Keeper)
```

**ملاحظة**: كل دور يرى قوائم مختلفة. التفاصيل في ملف `15_Roles_Permissions.md`.

---

## خريطة الصفحات

| # | الصفحة | المسار | النمط | الأدوار | المرحلة |
|---|--------|--------|:-----:|---------|:-------:|
| 1 | تسجيل الدخول | `/login` | خاص | الكل | 1 |
| 2 | لوحة التحكم | `/dashboard` | 3 | حسب الدور | 5 |
| 3 | الطلبات | `/orders` | 1 | pm,gm,manager,seller,driver(👁) | 3 |
| 4 | المشتريات | `/purchases` | 1 | pm,gm,manager,stock_keeper(👁) | 3 |
| 5 | المصاريف | `/expenses` | 1 | pm,gm,manager | 3 |
| 6 | التوصيلات | `/deliveries` | 1 | pm,gm,manager,seller(👁),driver | 4 |
| 7 | مهام السائق | `/driver-tasks` | 4 | pm,gm,manager,driver | 4 |
| 8 | تحضير الطلبات | `/preparation` | 4 | pm,gm,manager,stock_keeper | 4 |
| 9 | الفواتير | `/invoices` | 1 | pm,gm,manager,seller(👁),driver(👁) | 5 |
| 10 | الصندوق | `/treasury` | 1+2 | pm,gm(الكل),manager(صندوقي),driver(👁 عهدتي) | 5 |
| 11 | التسويات | `/settlements` | 1 | pm,gm | 5 |
| 12 | توزيع الأرباح | `/distributions` | 1 | pm,gm(إنشاء),manager(👁) | 5 |
| 13 | المخزون | `/stock` | 1 | pm,gm,manager,seller(👁 بدون أسعار),stock_keeper | 2 |
| 14 | صفحة منتج | `/stock/[id]` | 2 | pm,gm,manager,seller(👁),stock_keeper | 2 |
| 15 | كتالوج PDF | `/catalog` | خاص | pm,gm,manager,seller,stock_keeper | 2 |
| 16 | العملاء | `/clients` | 1 | pm,gm,manager,seller(👁+إضافة) | 2 |
| 17 | تفاصيل عميل | `/clients/[id]` | 2 | pm,gm,manager | 2 |
| 18 | الموردين | `/suppliers` | 1 | pm,gm,manager,stock_keeper(👁) | 2 |
| 19 | تفاصيل مورد | `/suppliers/[id]` | 2 | pm,gm,manager | 2 |
| 20 | الجرد | `/inventory` | 1 | pm,gm,manager,stock_keeper | 2 |
| 21 | عمولتي | `/my-bonus` | 2 | seller,driver | 5 |
| 22 | المستخدمين | `/users` | 1 | pm,gm | 2 |
| 23 | الإعدادات | `/settings` | خاص | pm,gm | 2 |
| 24 | الصلاحيات | `/permissions` | خاص | pm | 6 |
| 25 | سجل النشاطات | `/activity` | 1 | pm,gm,manager(👁) | 6 |

**الرموز**: 👁 = قراءة فقط

---

## المكونات المشتركة (Design System)

| المكون | الوصف |
|--------|-------|
| `PageShell` | عنوان + breadcrumb + أزرار إجراء |
| `DataTable` | جدول (desktop) + بطاقات (mobile) + sort + filter + CSV + pagination |
| `FormCard` | نموذج قابل للطي في grid متجاوب |
| `SummaryCards` | بطاقات KPI (2 موبايل / 4 كمبيوتر) |
| `FilterBar` | فلاتر (تاريخ + بحث + selects) |
| `DetailDialog` | نافذة تفاصيل key-value |
| `ConfirmDialog` | تأكيد إجراء |
| `CancelOrderDialog` | شاشة إلغاء C1 (3 خيارات إلزامية) |
| `SmartSelect` | اختيار مع بحث + إنشاء جديد |
| `TaskCard` | بطاقة مهمة مع إجراءات |
| `TabsContainer` | تبويبات مع محتوى |
| `ImageUpload` | رفع صور (كتالوج) |
| `DateRangePicker` | اختيار فترة زمنية |

---

## قواعد التجاوب الموحدة

| العنصر | موبايل (<768) | تابلت (768-1024) | كمبيوتر (>1024) |
|--------|:------------:|:----------------:|:---------------:|
| Sidebar | drawer | drawer | ثابت |
| النموذج | عمود واحد | عمودان | 3 أعمدة |
| الجدول | بطاقات | جدول مختصر | جدول كامل |
| KPI cards | عمودان | 3 أعمدة | 4 أعمدة |
| التفاصيل | صفحة كاملة | dialog | dialog |
| الإجراءات | قائمة ▼ | أزرار | أزرار |

---

## قواعد توحيد التجربة

| السلوك | القاعدة |
|--------|--------|
| إضافة | زر [+] في header → يفتح FormCard |
| تعديل | نقر على الصف → يملأ FormCard |
| حذف/إلغاء | زر في الصف → ConfirmDialog / CancelOrderDialog |
| عرض تفاصيل | أيقونة عين → DetailDialog |
| فلترة | FilterBar أعلى الجدول |
| ترتيب | نقر على عنوان العمود |
| تصدير | زر CSV في header |
| إشعار نجاح/خطأ | Toast (أعلى) |
| تحميل | Skeleton shimmer |
| صفحة فارغة | رسالة + زر إجراء |

---

## لوحات التحكم حسب الدور

| الدور | يرى في Dashboard |
|-------|-----------------|
| **PM/GM** | كل KPIs + أرصدة جميع الصناديق + charts + تقارير |
| **Manager** | عمليات فريقي + صندوقي + مبيعات الفترة |
| **Seller** | مبيعاتي + عمولاتي + هدايا متاحة |
| **Driver** | مهامي اليوم + أموال بحوزتي + عمولاتي |
| **Stock Keeper** | طلبات تنتظر تحضير + حالة المخزون + تنبيهات نقص |

---

## الصفحات الجانبية المتوقعة لكل دور

| الدور | الصفحة الافتراضية |
|-------|-------------------|
| PM/GM | `/dashboard` |
| Manager | `/dashboard` |
| Seller | `/orders` |
| Driver | `/driver-tasks` |
| Stock Keeper | `/preparation` |
