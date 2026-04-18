# نقاط الـ API — API Endpoints

> **رقم العنصر**: #35 | **المحور**: ح | **الحالة**: قيد التحديث

---

## المصادقة

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/auth/[...nextauth]` | GET/POST | عام | Auth.js v5 — تسجيل دخول/خروج |

## الطلبات (Orders — يحل محل Sales)

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/orders` | GET | الكل (مفلتر) | جلب الطلبات (seller: خاصتي، driver: مرتبطة) |
| `/api/orders` | POST | pm,gm,manager,seller | إنشاء طلب متعدد الأصناف |
| `/api/orders` | PUT | pm,gm,manager,seller | تعديل طلب محجوز فقط (BR-27/28) |
| `/api/orders/[id]/cancel` | POST | pm,gm,manager,seller(خاصتي) | إلغاء طلب — شاشة C1 |
| `/api/orders/[id]/collect` | POST | pm,gm,manager,seller | تحصيل دفعة على طلب محدد |

## المشتريات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/purchases` | GET | pm,gm,manager,stock_keeper(👁) | جلب المشتريات |
| `/api/purchases` | POST | pm,gm,manager | إنشاء مشتريات (يحدث المخزون + الأسعار) |
| `/api/purchases` | PUT | pm,gm | تعديل مشتريات |
| `/api/purchases` | DELETE | pm,gm | حذف مشتريات — شاشة C5 |
| `/api/purchases/[id]/pay` | POST | pm,gm,manager | دفعة للمورد |

## التوصيلات + المهام

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/deliveries` | GET | الكل (مفلتر) | جلب التوصيلات |
| `/api/deliveries` | PUT | pm,gm,manager,driver | تحديث حالة (driver: تأكيد خاصتي) |
| `/api/driver-tasks` | GET | pm,gm,manager,driver(خاصتي) | جلب المهام |
| `/api/driver-tasks` | POST | pm,gm,manager | تعيين مهمة |
| `/api/driver-tasks` | PUT | driver | تحديث حالة مهمتي |

## المنتجات + الكتالوج

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/products` | GET | الكل | جلب المنتجات (seller: بدون buy_price) |
| `/api/products` | POST | pm,gm,manager,stock_keeper | إنشاء منتج |
| `/api/products` | PUT | pm,gm,manager,stock_keeper(بدون أسعار) | تعديل منتج |
| `/api/products/[id]/images` | POST | pm,gm,manager,stock_keeper | رفع صور |
| `/api/products/[id]/images` | DELETE | pm,gm,manager | حذف صورة |
| `/api/catalog/pdf` | GET | pm,gm,manager,seller,stock_keeper | توليد PDF كتالوج (3 لغات) |
| `/api/gift-pool` | GET/PUT | pm,gm | إدارة مجمع الهدايا |

## العملاء + الموردين

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/clients` | GET | pm,gm,manager,seller(👁) | جلب العملاء |
| `/api/clients` | POST | pm,gm,manager,seller | إنشاء عميل |
| `/api/clients` | PUT | pm,gm,manager | تعديل عميل |
| `/api/clients/[id]/collect` | POST | pm,gm,manager,seller | تحصيل FIFO |
| `/api/suppliers` | GET | pm,gm,manager,stock_keeper(👁) | جلب الموردين |
| `/api/suppliers` | POST | pm,gm,manager | إنشاء مورد |
| `/api/suppliers` | DELETE | pm,gm | حذف مورد (BR-14) |

## المالية

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/invoices` | GET | الكل (مفلتر) | جلب الفواتير |
| `/api/invoices/[id]/pdf` | GET | الكل | PDF فاتورة (فرنسي) |
| `/api/treasury` | GET | pm,gm,manager(صندوقي),driver(عهدتي) | أرصدة + حركات |
| `/api/treasury/transfer` | POST | pm,gm | تحويل بين صناديق |
| `/api/treasury/reconcile` | POST | pm,gm,manager | تسوية يومية |
| `/api/treasury/handover` | POST | driver(تسليم),manager(استلام) | تسليم أموال |
| `/api/settlements` | GET/POST | pm,gm | التسويات والمكافآت |
| `/api/distributions` | GET | pm,gm,manager(👁) | توزيعات الأرباح |
| `/api/distributions` | POST | pm,gm | إنشاء توزيع |
| `/api/bonuses` | GET | الكل (مفلتر) | العمولات |

## النظام

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/users` | GET/POST/PUT | pm,gm | إدارة المستخدمين (لا DELETE) |
| `/api/users/bonus-rates` | GET/PUT/DELETE | pm,gm | تجاوزات العمولة |
| `/api/settings` | GET/PUT | pm,gm | الإعدادات |
| `/api/permissions` | GET/PUT | pm | الصلاحيات |
| `/api/backup` | GET/POST | pm,gm | تنزيل/استعادة نسخة (C4) |
| `/api/health` | GET | عام | DB latency + timestamp |
| `/api/expenses` | GET/POST/PUT/DELETE | pm,gm,manager | المصاريف |
| `/api/inventory/count` | GET/POST | pm,gm,manager,stock_keeper | الجرد |

## الإشعارات + النشاطات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/notifications` | GET | الكل | إشعاراتي |
| `/api/notifications/stream` | GET (SSE) | الكل | بث فوري |
| `/api/notifications/preferences` | GET/PUT | الكل | تفضيلاتي |
| `/api/activity` | GET | pm,gm,manager(👁) | سجل النشاطات |

## الصوت

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/voice/process` | POST | pm,gm,manager,seller | معالجة صوت → كيانات |
| `/api/voice/learn` | POST/PUT | الكل | تعلم + ربط action_id |

## قواعد العمولات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/commission-rules` | GET/POST/PUT/DELETE | pm,gm | قواعد العمولة حسب الفئة |
