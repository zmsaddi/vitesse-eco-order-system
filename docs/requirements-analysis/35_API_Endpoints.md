# توثيق نقاط الـ API — API Endpoints Documentation

> **رقم العنصر**: #34 | **المحور**: ح | **الحالة**: مكتمل

---

## المصادقة

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/auth/[...nextauth]` | GET/POST | عام | NextAuth — تسجيل دخول/خروج |

---

## المستخدمين

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/users` | GET | admin | جلب جميع المستخدمين |
| `/api/users` | POST | admin | إنشاء مستخدم |
| `/api/users` | PUT | admin | تعديل مستخدم (اسم، دور، كلمة مرور، تفعيل) |
| `/api/users` | PUT (toggle active) | admin | تعطيل/تفعيل مستخدم (لا حذف نهائي — BR-37) |
| `/api/users/bonus-rates` | GET | admin | جلب تجاوزات العمولة |
| `/api/users/bonus-rates` | PUT | admin | تعيين/تعديل تجاوز عمولة |
| `/api/users/bonus-rates` | DELETE | admin | حذف تجاوز عمولة |
| `/api/users/eligible-for-settlement` | GET | admin | المستخدمون المؤهلون للتسوية |

---

## المنتجات

| المسار | Method | الأدوار | الوصف | ملاحظة |
|--------|--------|---------|-------|--------|
| `/api/products` | GET | الكل | جلب المنتجات | seller: بدون buy_price |
| `/api/products` | POST | admin, manager, seller | إنشاء منتج | seller: shell فقط |
| `/api/products` | PUT | admin | تعديل منتج (sell_price, category, threshold) | buy_price غير قابل للتعديل |
| `/api/products` | DELETE | admin | حذف منتج | ممنوع إذا stock > 0 |

---

## المشتريات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/purchases` | GET | admin, manager | جلب المشتريات (فلتر بالمورد اختياري) |
| `/api/purchases` | POST | admin, manager | إنشاء مشترى (يحدث المخزون + الأسعار) |
| `/api/purchases` | PUT | admin | تعديل مشترى |
| `/api/purchases` | DELETE | admin | حذف مشترى (يعكس المخزون) |
| `/api/purchases/[id]/pay` | GET | admin, manager | جلب سجل دفعات المورد |
| `/api/purchases/[id]/pay` | POST | admin, manager | تسجيل دفعة للمورد |

---

## المبيعات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/sales` | GET | الكل | جلب المبيعات (seller: الخاصة فقط) |
| `/api/sales` | POST | admin, manager, seller | إنشاء بيع (يحجز المخزون + ينشئ توصيل) |
| `/api/sales` | PUT | admin, manager, seller | تعديل بيع |
| `/api/sales` | DELETE | admin, manager, seller | حذف/إلغاء بيع (حسب canCancelSale) |
| `/api/sales/[id]/cancel` | GET | admin, manager | معاينة الإلغاء (بدون تنفيذ) |
| `/api/sales/[id]/cancel` | POST | admin, manager | تنفيذ الإلغاء (12 خطوة) |
| `/api/sales/[id]/collect` | POST | admin, manager, seller | تحصيل دفعة على بيع محدد |

---

## التوصيل

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/deliveries` | GET | الكل | جلب التسليمات (مفلترة حسب الدور) |
| `/api/deliveries` | POST | admin, manager | إنشاء توصيل |
| `/api/deliveries` | PUT | admin, manager, driver | تحديث (driver: تم التوصيل فقط) |
| `/api/deliveries` | DELETE | admin | حذف/إلغاء توصيل |

---

## العملاء

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/clients` | GET | الكل | جلب العملاء |
| `/api/clients` | POST | admin, manager, seller | إنشاء عميل (مع كشف التكرار) |
| `/api/clients` | PUT | admin | تعديل عميل |
| `/api/clients` | DELETE | admin | حذف عميل (ممنوع إذا له مبيعات) |
| `/api/clients/[id]/collect` | POST | admin, manager, seller | تحصيل FIFO من العميل |

---

## الدفعات والفواتير والعمولات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/payments` | GET | admin, manager | جلب الدفعات |
| `/api/payments` | POST | admin, manager | إنشاء دفعة |
| `/api/payments` | DELETE | admin | حذف دفعة |
| `/api/invoices` | GET | الكل | جلب الفواتير (مفلترة حسب الدور) |
| `/api/invoices` | PUT | admin | إلغاء فاتورة (void) |
| `/api/bonuses` | GET | الكل | جلب العمولات (seller/driver: الخاصة) |

---

## التسويات وتوزيع الأرباح

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/settlements` | GET | admin | جلب التسويات |
| `/api/settlements` | POST | admin | إنشاء تسوية |
| `/api/settlements/available-credit` | GET | admin | الرصيد المتاح للمستخدم |
| `/api/profit-distributions` | GET | admin, manager | جلب التوزيعات |
| `/api/profit-distributions` | POST | admin | إنشاء توزيع |
| `/api/profit-distributions/eligible-users` | GET | admin, manager | المستخدمون المؤهلون |
| `/api/profit-distributions/collected-revenue` | GET | admin, manager | الإيراد المحصّل للفترة |
| `/api/profit-distributions/share-config` | GET/PUT | admin | إعداد حصص المشاركة |

---

## النظام

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/expenses` | GET/POST | admin, manager | المصاريف |
| `/api/expenses` | PUT/DELETE | admin | تعديل/حذف مصروف |
| `/api/suppliers` | GET/POST | admin, manager | الموردين |
| `/api/suppliers` | DELETE | admin | حذف مورد (ممنوع إذا له مشتريات — BR-33) |
| `/api/settings` | GET | الكل | جلب الإعدادات |
| `/api/settings` | PUT | admin | تعديل الإعدادات |
| `/api/summary` | GET | الكل | بيانات لوحة التحكم (مفلترة حسب الدور) |
| `/api/health` | GET | عام | فحص الصحة |
| `/api/init` | GET | admin | تهيئة قاعدة البيانات (idempotent) |
| `/api/init` | POST | admin | إعادة تعيين (مُقيد بـ ALLOW_DB_RESET) |

---

## الصوت

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/voice/process` | POST | admin, manager, seller | معالجة تسجيل صوتي |
| `/api/voice/learn` | POST | الكل | تسجيل تصحيحات المستخدم |
| `/api/voice/learn` | PUT | الكل | ربط action_id بسجل صوتي |
