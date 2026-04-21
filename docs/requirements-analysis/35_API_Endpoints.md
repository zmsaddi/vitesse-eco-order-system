# نقاط الـ API — API Endpoints

> **رقم العنصر**: #35 | **المحور**: ح | **الحالة**: مواصفات نهائية

---

## السياسات الحاكمة

### سياسة الـ DELETE (D-04 + D-76 — Post-Round-7)

**DELETE ممنوع على أي كيان مالي/تشغيلي/تدقيقي**. إذا صف يحتاج "إزالة"، فالبديل:
- **Soft-delete** (`UPDATE SET deleted_at = NOW()`) — للكيانات التي تحمل `deleted_at`.
- **Soft-disable** (`UPDATE SET active = false`) — للكيانات configuration (`users`, `suppliers`, `products`, `clients`, `commission_rules`).
- **Reverse entry** (صف معاكس بـ `amount` سالب) — للمصاريف والحركات المالية.

**DELETE مسموح** حصراً على:
- ✅ `/api/v1/products/[id]/images` — صور على Blob، ليست مالياً.
- ✅ `/api/v1/users/bonus-rates` — override config، يعود للقيم الافتراضية.
- ✅ `/api/v1/permissions` (منفرداً عبر CRUD) — config matrix.

**DELETE محظور صريحاً** (D-76):
- ❌ `/api/v1/suppliers` — استُبدِل بـ `PUT { active: false }`.
- ❌ `/api/v1/expenses` — لا DELETE. reverse entry فقط.
- ❌ أي endpoint على: `orders`, `order_items`, `deliveries`, `invoices`, `invoice_lines`, `payments`, `purchases`, `bonuses`, `settlements`, `distributions`, `treasury_movements`, `activity_log`, `cancellations`, `price_history`, `supplier_payments`, `inventory_counts`, `voice_logs` (retention عبر cron فقط، ليس endpoint).

**المرجع القانوني**: C. com art. L123-22 (10 سنوات حفظ) + CGI art. 286-I-3° bis (inaltérabilité — loi anti-fraude TVA 2018). RESTRICT FK (D-27) + REVOKE DELETE على financial tables (D-04) = دفاع متعدد الطبقات.

### Versioning (D-66 — Post-Round-7)

كل **Business API** يبدأ بـ `/api/v1/` من Phase 0. لاحقاً (بعد Phase 6)، ترقية `/api/v2/` إذا تغيَّر العقد breaking. **كل الجداول أدناه مُطبَّق عليها الـ prefix فعلياً** — ليست سياسة مؤجَّلة.

**خارج الـ versioning**:
- `/api/auth/*` (Auth.js standard callbacks)
- `/api/cron/*` (internal scheduler)
- `/api/health` (probe)
- `/api/init`, `/api/backup/*` (dev/admin)

---

## المصادقة

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/auth/[...nextauth]` | GET/POST | عام | Auth.js v5 — تسجيل دخول/خروج |

## الطلبات (Orders)

| المسار | Method | الأدوار | `Idempotency-Key` | الوصف |
|--------|--------|---------|:-----------------:|-------|
| `/api/v1/orders` | GET | الكل (مفلتر) | — | جلب الطلبات (seller: خاصتي، driver: مرتبطة). **pagination إلزامي** — `?limit=50&offset=0` |
| `/api/v1/orders` | POST | pm,gm,manager,seller | مُوصى به | إنشاء طلب متعدد الأصناف |
| `/api/v1/orders/[id]` | PUT | pm,gm,manager,seller(خاصتي) | مُوصى به | تعديل طلب محجوز فقط (BR-27/28) |
| `/api/v1/orders/[id]/start-preparation` | POST | pm,gm,manager,stock_keeper | مُوصى به | انتقال `محجوز → قيد التحضير` (Stock Keeper يبدأ التحضير) |
| `/api/v1/orders/[id]/cancel` | POST | pm,gm,manager(حتى جاهز — D-11),seller(خاصتي المحجوزة) | **إلزامي** | إلغاء طلب — شاشة C1 |
| `/api/v1/orders/[id]/collect` | POST | pm,gm,manager,seller,driver | **إلزامي** | تحصيل دفعة على طلب محدد. **(D-44)** إذا role=driver: يفحص سقف العهدة (`driver_custody.balance + amount ≤ settings.driver_custody_cap_eur`) وإلا 409 `CUSTODY_CAP_EXCEEDED`. Override: header `X-Force-Collect: true` (PM only). |

**ملاحظة**: لا `DELETE` على `/api/v1/orders` — الحذف ناعم فقط (D-04).

## المشتريات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/purchases` | GET | pm,gm,manager,stock_keeper(👁) | جلب المشتريات |
| `/api/v1/purchases` | POST | pm,gm,manager | إنشاء مشتريات (يحدث المخزون + الأسعار) |
| `/api/v1/purchases` | PUT | pm,gm | تعديل مشتريات |
| `/api/v1/purchases/[id]/reverse` | POST | pm,gm | عكس مشتريات — شاشة C5 (soft-delete + revert weighted avg + credit_due_from_supplier حسب الخيار). لا DELETE endpoint (D-04). |
| `/api/v1/purchases/[id]/pay` | POST | pm,gm,manager | دفعة للمورد |

## التوصيلات + المهام

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/deliveries` | GET | الكل (مفلتر) | جلب التوصيلات |
| `/api/v1/deliveries` | PUT | pm,gm,manager,driver | تحديث حالة (driver: تأكيد خاصتي) |
| `/api/v1/driver-tasks` | GET | pm,gm,manager,driver(خاصتي) | جلب المهام |
| `/api/v1/driver-tasks` | POST | pm,gm,manager | تعيين مهمة |
| `/api/v1/driver-tasks` | PUT | driver | تحديث حالة مهمتي |

## المنتجات + الكتالوج

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/products` | GET | الكل | جلب المنتجات (seller: بدون buy_price) |
| `/api/v1/products` | POST | pm,gm,manager,stock_keeper | إنشاء منتج |
| `/api/v1/products` | PUT | pm,gm,manager,stock_keeper(بدون أسعار) | تعديل منتج |
| `/api/v1/products/[id]/images` | POST | pm,gm,manager,stock_keeper | رفع صور |
| `/api/v1/products/[id]/images` | DELETE | pm,gm,manager | حذف صورة |
| `/api/v1/catalog/pdf` | GET | pm,gm,manager,seller,stock_keeper | توليد PDF كتالوج (3 لغات) |
| `/api/v1/gift-pool` | GET/PUT | pm,gm | إدارة مجمع الهدايا |

## العملاء + الموردين

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/clients` | GET | pm,gm,manager,seller(👁) | جلب العملاء |
| `/api/v1/clients` | POST | pm,gm,manager,seller | إنشاء عميل |
| `/api/v1/clients` | PUT | pm,gm,manager | تعديل عميل |
| `/api/v1/clients/[id]/collect` | POST | pm,gm,manager,seller,driver | تحصيل FIFO. **(D-44)** نفس فحص سقف العهدة إذا role=driver. |
| `/api/v1/suppliers` | GET | pm,gm,manager,stock_keeper(👁) | جلب الموردين |
| `/api/v1/suppliers` | POST | pm,gm,manager | إنشاء مورد |
| `/api/v1/suppliers/[id]` | PUT | pm,gm | **(D-76 + D-04)** soft-disable عبر `{ active: false }` — لا hard delete. يُبقى على السجلات المالية المرتبطة (purchases, supplier_payments) كما هي. |

## المالية

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/invoices` | GET | الكل (مفلتر) | جلب الفواتير (pagination إلزامي) |
| `/api/v1/invoices/[id]/pdf` | GET | الكل | PDF فاتورة (فرنسي، FAC-YYYY-MM-NNNN — D-01) |
| `/api/v1/invoices/[id]/avoir` | POST | pm,gm | إصدار Avoir (credit note) — فاتورة عكسية بمبلغ سالب، لا يُحذف الأصل (H7 محاسبياً صحيح) |
| `/api/v1/treasury` | GET | pm,gm,manager(صندوقي + عهدات فريقي),driver(عهدتي) | Phase 4.2 — أرصدة + حركات. Response: `{ accounts, movements, movementsTotal }`. Manager filter يستخدم `users.manager_id` لتحديد فريق المدير (لا cross-team). seller/stock_keeper → 403. |
| `/api/v1/treasury/transfer` | POST | pm,gm | **Phase 4.3 (داخل Phase 4 closure)** — أربع مسارات فقط مسموح بها: `main_cash → manager_box` (funding) و`manager_box → main_cash` (manager_settlement) و`main_cash → main_bank` (bank_deposit) و`main_bank → main_cash` (bank_withdrawal). `Idempotency-Key` إلزامي. |
| `/api/v1/treasury/reconcile` | POST | pm,gm (أي حساب), manager (صندوقه فقط) | **Phase 4.3 (داخل Phase 4 closure)** — تسوية يومية؛ لا تُستخدم كـ transfer مقنّع. `Idempotency-Key` إلزامي. |
| `/api/v1/treasury/handover` | POST | driver(تسليم), manager(استلام لسائق تابع له) | **Phase 4.2 — shipped** — driver_custody → manager_box حصراً، `category='driver_handover'`. Body: `{ amount, driverUserId?, notes? }`. Driver caller: `driverUserId` يُتجاهَل ويُفرض = own userId. Manager caller: `driverUserId` إلزامي و`drv.manager_id === manager.userId` (server-enforced). `Idempotency-Key` **إلزامي** (D-79). |
| `/api/v1/settlements` | GET | pm,gm,manager | **Phase 4.4 (داخل Phase 4 closure)** — قائمة التسويات (pagination). |
| `/api/v1/settlements` | POST | pm,gm | **Phase 4.4 (داخل Phase 4 closure)** — التسويات والمكافآت + negative settlement (من `cancel_as_debt` على bonus مسوَّاة)؛ `Idempotency-Key` إلزامي. |
| `/api/v1/distributions` | GET | pm,gm,manager(👁) | **Phase 6 (مؤجَّل بعد إغلاق Phase 4 — NOT a closure blocker)** — توزيعات الأرباح. expert-comptable يتولاها حالياً خارج النظام. |
| `/api/v1/distributions` | POST | pm,gm | **Phase 6 (مؤجَّل بعد إغلاق Phase 4 — NOT a closure blocker)** — إنشاء توزيع؛ `Idempotency-Key` إلزامي. |
| `/api/v1/bonuses` | GET | الكل (مفلتر) | العمولات |

## النظام

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/users` | GET/POST/PUT | pm,gm | إدارة المستخدمين (لا DELETE) |
| `/api/v1/users/bonus-rates` | GET/PUT/DELETE | pm,gm | تجاوزات العمولة |
| `/api/v1/settings` | GET/PUT | pm,gm | الإعدادات |
| `/api/v1/permissions` | GET/PUT | pm | الصلاحيات |
| `/api/backup` | GET/POST | pm,gm | تنزيل/استعادة نسخة (C4) |
| `/api/health` | GET | عام | DB latency + timestamp |
| `/api/v1/expenses` | GET/POST/PUT | pm,gm,manager | **(D-76 + D-04)** المصاريف — **لا DELETE**. تصحيح مصروف خاطئ يمر عبر `/[id]/reverse` (أدناه). |
| `/api/v1/expenses/[id]/reverse` | POST | pm,gm | **(D-82)** عكس مصروف — ينشئ صف `expenses` جديد بـ `amount < 0` + `reversal_of = {original.id}` (عمود بنيوي FK، ليس `notes`) + `notes = reason` + activity_log `action='reverse'`. محمي بـ `Idempotency-Key` (`requireHeader='required'` — D-79). `reversal_of` عليه partial unique يمنع double-reversal. عكس صف عكسي نفسه مرفوض (`reversal_of IS NOT NULL` على الأصل → reject). |
| `/api/v1/inventory/count` | GET/POST | pm,gm,manager,stock_keeper | الجرد |

## الإشعارات + النشاطات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/notifications` | GET | الكل | إشعاراتي (pagination). يُستدعى on-demand عند فتح Bell Dropdown (D-42). كل API response عادية تحمل `X-Unread-Count` header للـ badge. |
| `/api/v1/notifications/preferences` | GET/PUT | الكل | تفضيلاتي (channel = in_app فقط — D-22) |

~~`/api/v1/notifications/stream`~~ **محذوف (D-41)** — SSE لم يُحقَّق على Neon HTTP + Vercel timeout 300s. Polling هو الحل الوحيد.
| `/api/v1/activity` | GET | pm,gm,manager(👁) | سجل النشاطات |

## الصوت

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/voice/process` | POST | pm,gm,manager,seller | معالجة صوت → كيانات |
| `/api/v1/voice/learn` | POST/PUT | الكل | تعلم + ربط action_id |

## قواعد العمولات

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/commission-rules` | GET/POST/PUT | pm,gm | قواعد العمولة حسب الفئة (لا DELETE — soft inactive فقط) |

## Cron (internal)

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/cron/daily` | GET | `Bearer CRON_SECRET` | تنظيف + تذكير reconciliation + overdue flip + orphan Blob cleanup |
| `/api/cron/hourly` | GET | `Bearer CRON_SECRET` | prune rate-limit cache + dispatch queued notifications |

## GDPR / Privacy

| المسار | Method | الأدوار | الوصف |
|--------|--------|---------|-------|
| `/api/v1/clients/[id]/anonymize` | POST | pm | pseudonymization لحقوق GDPR (يُبقي السجلات المالية، يمحو PII) |

## الترقيم والـ Idempotency

- **Default pagination** على كل `GET /api/<list>`: `limit=50 default`, `limit=1000 max`. طلب بلا `limit` → يُرد بـ default.
- **Idempotency-Key header**:
  - مُحدَّد في `02_DB_Tree.md` (جدول `idempotency_keys`) + `29_Concurrency.md` (flow).
  - **إلزامي** على: cancel, collect, settlements POST, distributions POST.
  - **مُوصى به** على: orders POST/PUT, payments POST, purchases POST/reverse.
  - 409 `IDEMPOTENCY_KEY_MISMATCH` إذا الـ key يتكرر مع body مختلف (request_hash mismatch — D-79).
  - 409 `IDEMPOTENCY_KEY_OWNER_MISMATCH` إذا الـ key يتكرر مع username مختلف على نفس الـ endpoint (D-79).
  - 400 `IDEMPOTENCY_KEY_REQUIRED` إذا مفقود على endpoint إلزامي.
