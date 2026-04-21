# نموذج البيانات — Database Schema

> **رقم العنصر**: #02 | **المحور**: أ | **الحالة**: مواصفات نهائية
> **قاعدة البيانات**: PostgreSQL 17+ (Neon Serverless)
> **ORM**: Drizzle ORM + `@neondatabase/serverless` (WebSocket Pool للكتابات متعددة الجمل)
> **عدد الجداول**: 36
> **الدقة المالية**: `NUMERIC(19,2)` — كل الأرقام TTC
> **التواريخ**: `DATE` / `TIMESTAMPTZ` — المنطقة الزمنية `Europe/Paris`
>
> **سياسة الحذف**: كل الجداول المالية والحركية تستخدم soft-delete (`deleted_at TIMESTAMPTZ`) + FK `ON DELETE RESTRICT`. الحذف الفعلي يقتصر على البيانات المساعدة (price_history, notifications, voice_logs) خلف retention policies.

---

## فهرس الجداول (المجموع: 36 جدول)

| # | المجموعة | الجداول |
|---|---------|---------|
| 1-2 | المستخدمين والإعدادات | users, settings |
| 3-5 | المنتجات والكتالوج | products, product_images, product_commission_rules |
| 6-7 | الموردين | suppliers, supplier_payments |
| 8 | العملاء | clients |
| 9-12 | الطلبات | orders, order_items, gift_pool, payments |
| 13-14 | المشتريات | purchases, price_history |
| 15 | المصاريف | expenses |
| 16-17 | التوصيل والمهام | deliveries, driver_tasks |
| 18-19 | الفواتير | invoices, invoice_sequence |
| 20-22 | العمولات والتسويات | bonuses, user_bonus_rates, settlements |
| 23-24 | توزيع الأرباح | profit_distribution_groups, profit_distributions |
| 25-27 | الصناديق المالية | treasury_accounts, treasury_movements, payment_schedule |
| 28-29 | التنبيهات | notifications, notification_preferences |
| 30 | سجل النشاطات | activity_log |
| 31 | الصلاحيات | permissions |
| 32 | الإلغاءات | cancellations |
| 32b | منع التكرار | **idempotency_keys** (D-16 — جديد) |
| 33 | الجرد | inventory_counts |
| 34 | سجل الصوت | voice_logs |
| 35 | أسماء الكيانات | entity_aliases |
| 36a | تصحيحات AI | ai_corrections |
| 36b | أنماط AI | ai_patterns |

---

## 1. `users` — المستخدمين

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| username | TEXT | UNIQUE, NOT NULL |
| password | TEXT | NOT NULL (Argon2id — D-40؛ bcrypt 14 fallback) |
| name | TEXT | NOT NULL |
| role | TEXT | NOT NULL, DEFAULT 'seller' |
| active | BOOLEAN | DEFAULT true |
| profit_share_pct | NUMERIC(5,2) | DEFAULT 0 |
| profit_share_start | DATE | NULL |
| onboarded_at | TIMESTAMPTZ | NULL (D-49 — أول welcome modal يُعرض حتى يصبح NOT NULL) |
| manager_id | INTEGER | NULL → FK users.id ON DELETE RESTRICT — Phase 4.2: required at the service layer for active drivers (DRIVER_MANAGER_REQUIRED). Other roles may leave NULL. |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**CHECK**: `role IN ('pm','gm','manager','seller','driver','stock_keeper')`
**Service-layer rule (Phase 4.2)**: `role='driver' AND active=true ⇒ manager_id IS NOT NULL`. Legacy drivers without manager_id are grandfathered, but treasury operations on them are rejected with `CUSTODY_DRIVER_UNLINKED`.

---

## 2. `settings` — الإعدادات

| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |

**CHECK (D-28 — مفاتيح مسموحة فقط)**:
```sql
CHECK (key IN (
  -- Shop identity (D-35 — mandatory mentions)
  'shop_name', 'shop_legal_form', 'shop_siren', 'shop_siret', 'shop_ape',
  'shop_vat_number', 'shop_address', 'shop_city', 'shop_email', 'shop_website',
  'shop_iban', 'shop_bic', 'shop_capital_social', 'shop_rcs_city',
  'shop_rcs_number', 'shop_penalty_rate_annual', 'shop_recovery_fee_eur',
  -- Invoicing
  'vat_rate', 'invoice_currency',
  -- Bonuses / Commissions
  'seller_bonus_fixed', 'seller_bonus_percentage', 'driver_bonus_fixed',
  'max_discount_seller_pct', 'max_discount_manager_pct',
  -- Operational limits
  'vin_required_categories', 'driver_custody_cap_eur',
  'sku_limit', 'max_images_per_product',
  -- Voice system
  'voice_rate_limit_per_min', 'voice_max_audio_seconds', 'voice_min_audio_ms',
  -- UX
  'auto_refresh_interval_ms',
  -- Retention
  'activity_log_retention_days', 'voice_logs_retention_days',
  'read_notifications_retention_days',
  -- Monitoring (D-42)
  'neon_hours_used_this_month'
))
```

**Typed accessor (D-28)**: `src/lib/settings.ts` يُعرِّف Zod schema `SettingsSchema` + helper `getSettings(): Promise<Settings>` مع cache TTL 60s. لا parseInt/parseFloat يدوي — كل قراءة typed.

---

## 3. `products` — المنتجات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | TEXT | UNIQUE, NOT NULL |
| category | TEXT | NOT NULL, DEFAULT '' |
| unit | TEXT | DEFAULT '' |
| buy_price | NUMERIC(19,2) | DEFAULT 0 |
| sell_price | NUMERIC(19,2) | DEFAULT 0 |
| stock | NUMERIC(19,2) | DEFAULT 0 |
| low_stock_threshold | INTEGER | DEFAULT 3 |
| active | BOOLEAN | DEFAULT true |
| description_ar | TEXT | DEFAULT '' |
| description_long | TEXT | DEFAULT '' |
| specs | JSONB | DEFAULT '{}' |
| catalog_visible | BOOLEAN | DEFAULT true |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**ملاحظة**: المنتجات لا تُحذف أبداً — تُعطّل فقط (active=false). قرار H6.

---

## 4. `product_images` — صور المنتجات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| product_id | INTEGER | NOT NULL → FK products.id ON DELETE RESTRICT (D-27) |
| url | TEXT | NOT NULL |
| is_primary | BOOLEAN | DEFAULT false |
| sort_order | INTEGER | DEFAULT 0 |
| uploaded_by | TEXT | NOT NULL |
| uploaded_at | TIMESTAMPTZ | DEFAULT NOW() |

**ملاحظة**: الصور تُخزّن في Vercel Blob أو Cloudinary — الجدول يحفظ الرابط فقط.

---

## 5. `product_commission_rules` — قواعد العمولة حسب فئة المنتج

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| category | TEXT | NOT NULL |
| seller_fixed_per_unit | NUMERIC(19,2) | DEFAULT 0 |
| seller_pct_overage | NUMERIC(5,2) | DEFAULT 0 |
| driver_fixed_per_delivery | NUMERIC(19,2) | DEFAULT 0 |
| priority | INTEGER | DEFAULT 0 |
| created_by | TEXT | NOT NULL |
| updated_at | TIMESTAMPTZ | NULL |

**CHECK**: `seller_pct_overage >= 0 AND seller_pct_overage <= 100`
**CHECK**: `seller_fixed_per_unit >= 0`
**CHECK**: `driver_fixed_per_delivery >= 0`

---

## 6. `suppliers` — الموردين

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | TEXT | NOT NULL |
| phone | TEXT | DEFAULT '' |
| address | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| credit_due_from_supplier | NUMERIC(19,2) | NOT NULL DEFAULT 0 (D-10 + D-62: رصيد دائن من إلغاء شراء مدفوع. rename من `credit_balance`) |
| active | BOOLEAN | DEFAULT true |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| deleted_at | TIMESTAMPTZ | NULL |
| deleted_by | TEXT | NULL |

**UNIQUE (partial)**: `(name, phone) WHERE phone != '' AND deleted_at IS NULL`
**ملاحظة**: الموردين لا تُحذف — تُعطَّل (`active=false`).

---

## 7. `supplier_payments` — دفعات الموردين

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| purchase_id | INTEGER | NOT NULL → FK purchases.id ON DELETE RESTRICT |
| date | DATE | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| payment_method | TEXT | DEFAULT 'كاش' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**CHECK**: `payment_method IN ('كاش','بنك')`

---

## 8. `clients` — العملاء

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | TEXT | NOT NULL |
| latin_name | TEXT | DEFAULT '' |
| phone | TEXT | DEFAULT '' |
| email | TEXT | DEFAULT '' |
| address | TEXT | DEFAULT '' |
| description_ar | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**UNIQUE**: `(name, phone) WHERE phone != ''`
**UNIQUE**: `(name, email) WHERE email != ''`

---

## 9. `orders` — الطلبات (يحل محل sales)

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | NOT NULL (ORD-YYYYMMDD-NNNNN) |
| date | DATE | NOT NULL |
| client_id | INTEGER | NOT NULL → FK clients.id ON DELETE RESTRICT (D-20) |
| client_name_cached | TEXT | NOT NULL (D-20) |
| client_phone_cached | TEXT | DEFAULT '' |
| delivery_address | TEXT | DEFAULT '' (override — يعبَّأ من clients.address افتراضياً، قابل للتعديل للطلب فقط) |
| status | TEXT | DEFAULT 'محجوز' |
| payment_method | TEXT | NOT NULL |
| total_amount | NUMERIC(19,2) | DEFAULT 0 |
| paid_amount | NUMERIC(19,2) | DEFAULT 0 |
| remaining | NUMERIC(19,2) | DEFAULT 0 |
| payment_status | TEXT | DEFAULT 'pending' |
| down_payment | NUMERIC(19,2) | DEFAULT 0 (dérivé من `payments WHERE type='advance'` — يُحدَّث عبر trigger؛ قيمة snapshot فقط) |
| cancel_reason | TEXT | NULL |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | NULL (soft-delete — D-04) |
| deleted_by | TEXT | NULL |

**CHECK**: `status IN ('محجوز','قيد التحضير','جاهز','مؤكد','ملغي')` (D-03)
**CHECK**: `payment_method IN ('كاش','بنك','آجل')`
**CHECK**: `payment_status IN ('pending','partial','paid','cancelled')`
**UNIQUE (partial)**: `ref_code WHERE ref_code != '' AND deleted_at IS NULL`
**INDEX**: `orders_client_id_idx ON (client_id)` (D-20)
**INDEX**: `orders_payment_status_idx ON (payment_status)`
**INDEX**: `orders_status_idx ON (status)` (لـ dashboard queries)

---

## 10. `order_items` — أصناف الطلب

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| order_id | INTEGER | NOT NULL → FK orders.id ON DELETE RESTRICT (D-27) |
| product_id | INTEGER | NOT NULL → FK products.id ON DELETE RESTRICT (D-20) |
| product_name_cached | TEXT | NOT NULL (اسم المنتج لحظة الإنشاء — D-20) |
| category | TEXT | DEFAULT '' (snapshot من products.category وقت الإنشاء) |
| quantity | NUMERIC(19,2) | NOT NULL CHECK (quantity > 0) |
| unit_price | NUMERIC(19,2) | NOT NULL (TTC، بعد الخصم) |
| recommended_price | NUMERIC(19,2) | NOT NULL (snapshot من products.sell_price عند الإنشاء — للعمولة) |
| cost_price | NUMERIC(19,2) | DEFAULT 0 (snapshot من products.buy_price) |
| line_total | NUMERIC(19,2) | NOT NULL (= quantity × unit_price للأصناف العادية، = 0 للهدايا) |
| discount_type | TEXT | NULL |
| discount_value | NUMERIC(19,2) | DEFAULT 0 |
| discount_reason | TEXT | DEFAULT '' |
| is_gift | BOOLEAN | DEFAULT false |
| gift_approved_by | TEXT | NULL |
| vin | TEXT | DEFAULT '' (إلزامي إذا category ∈ vin_required_categories) |
| commission_rule_snapshot | JSONB | NOT NULL DEFAULT '{}' (D-17 — القواعد المُطبَّقة لحظة الإنشاء) |
| commission_amount | NUMERIC(19,2) | DEFAULT 0 (يُحسب عند تأكيد التسليم) |
| deleted_at | TIMESTAMPTZ | NULL |

**CHECK**: `discount_type IN ('percent','fixed') OR discount_type IS NULL`
**INDEX**: `order_items_product_id_idx ON (product_id)` (D-20)
**INDEX**: `order_items_order_id_idx ON (order_id)`
**ملاحظة**: `commission_rule_snapshot` يحتوي: `{ source, seller_fixed_per_unit, seller_pct_overage, driver_fixed_per_delivery, captured_at }` (D-17). يُستخدم عند `calculateBonusInTx` بدلاً من القواعد الحالية.

---

## 11. `gift_pool` — مجمع الهدايا

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| product_id | INTEGER | NOT NULL → FK products.id |
| max_quantity | INTEGER | NOT NULL |
| remaining_quantity | INTEGER | NOT NULL |
| enabled | BOOLEAN | DEFAULT true |
| set_by | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 12. `payments` — دفعات العملاء

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | DATE | NOT NULL |
| client_id | INTEGER | NULL → FK clients.id ON DELETE RESTRICT (D-20) |
| client_name_cached | TEXT | NOT NULL (D-20) |
| amount | NUMERIC(19,2) | NOT NULL (موقَّع — refund سالب، D-06) |
| order_id | INTEGER | NULL → FK orders.id ON DELETE RESTRICT |
| type | TEXT | DEFAULT 'collection' |
| payment_method | TEXT | DEFAULT 'كاش' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| deleted_at | TIMESTAMPTZ | NULL (soft-delete — لا hard delete، D-04) |
| deleted_by | TEXT | NULL |

**CHECK**: `type IN ('collection','refund','advance')`
**CHECK**: `payment_method IN ('كاش','بنك')`
**ملاحظة**: `tva_amount` **محذوف** (D-02) — TVA تُحسب عند render الفاتورة فقط، ليست مخزَّنة.
**ملاحظة**: `amount` موقَّع — refund = قيمة سالبة (تعكس ديناميكياً cash flow).

---

## 13. `purchases` — المشتريات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | DEFAULT '' |
| date | DATE | NOT NULL |
| supplier_id | INTEGER | NOT NULL → FK suppliers.id ON DELETE RESTRICT (D-20) |
| supplier_name_cached | TEXT | NOT NULL (D-20) |
| product_id | INTEGER | NOT NULL → FK products.id ON DELETE RESTRICT |
| item_name_cached | TEXT | NOT NULL |
| category | TEXT | DEFAULT '' |
| quantity | NUMERIC(19,2) | NOT NULL CHECK (quantity > 0) |
| unit_price | NUMERIC(19,2) | NOT NULL |
| total | NUMERIC(19,2) | NOT NULL |
| payment_method | TEXT | DEFAULT 'كاش' |
| paid_amount | NUMERIC(19,2) | DEFAULT 0 |
| payment_status | TEXT | DEFAULT 'paid' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| deleted_at | TIMESTAMPTZ | NULL |
| deleted_by | TEXT | NULL |

**CHECK**: `payment_method IN ('كاش','بنك','آجل')`
**CHECK**: `payment_status IN ('paid','partial','pending')`
**UNIQUE (partial)**: `ref_code WHERE ref_code != '' AND deleted_at IS NULL`
**INDEX**: `purchases_supplier_id_idx ON (supplier_id)` (D-20)
**INDEX**: `purchases_product_id_idx ON (product_id)`

---

## 14. `price_history` — سجل تغييرات الأسعار

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | DATE | NOT NULL |
| product_name | TEXT | NOT NULL |
| old_buy_price | NUMERIC(19,2) | DEFAULT 0 |
| new_buy_price | NUMERIC(19,2) | DEFAULT 0 |
| old_sell_price | NUMERIC(19,2) | DEFAULT 0 |
| new_sell_price | NUMERIC(19,2) | DEFAULT 0 |
| purchase_id | INTEGER | NULL |
| changed_by | TEXT | NOT NULL |

**INDEX**: `price_history_product_name_idx ON (product_name)`

---

## 15. `expenses` — المصاريف

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | DATE | NOT NULL |
| category | TEXT | NOT NULL |
| description | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| payment_method | TEXT | DEFAULT 'كاش' |
| comptable_class | TEXT | NULL (D-61 — PCG class e.g. '6037' inventory_loss، '6251' postage، '6064' supplies. يُصدَّر في CSV للـ expert-comptable) |
| notes | TEXT | DEFAULT '' |
| reversal_of | INTEGER | NULL → FK expenses.id ON DELETE RESTRICT (D-82). عمود بنيوي يربط الصف العكسي بالأصلي؛ NULL للصفوف العادية. |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| deleted_at | TIMESTAMPTZ | NULL (soft-delete؛ ممنوع DELETE — D-04) |

**قيود إضافية (D-82)**:
- `CHECK (reversal_of IS NULL OR reversal_of <> id)` — يمنع self-reference.
- `CHECK (reversal_of IS NULL OR amount < 0)` — الصف العكسي يجب أن يحمل مبلغاً سالباً.
- `UNIQUE INDEX expenses_one_reversal_per_original ON expenses (reversal_of) WHERE reversal_of IS NOT NULL AND deleted_at IS NULL` — يمنع double-reversal لنفس الأصل.

**قواعد تشغيلية**:
- الـreversal يُنشأ عبر `POST /api/v1/expenses/[id]/reverse` فقط (service ينشئ الصف مع `reversal_of = original.id` + `amount = -original.amount`).
- لا يمكن عكس صف عكسي نفسه (الأصل يجب أن يحمل `reversal_of IS NULL`).
- `notes` يبقى حقلاً توضيحياً — ليس مرجعاً بنيوياً.

---

## 16. `deliveries` — التوصيلات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | DEFAULT '' |
| date | DATE | NOT NULL |
| order_id | INTEGER | NOT NULL → FK orders.id ON DELETE RESTRICT |
| client_id | INTEGER | NOT NULL → FK clients.id ON DELETE RESTRICT (D-20) |
| client_name_cached | TEXT | NOT NULL (D-20) |
| client_phone_cached | TEXT | DEFAULT '' |
| address | TEXT | DEFAULT '' |
| status | TEXT | DEFAULT 'قيد الانتظار' |
| assigned_driver_id | INTEGER | NULL → FK users.id ON DELETE RESTRICT |
| assigned_driver_username_cached | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| confirmation_date | TIMESTAMPTZ | NULL (يُعبَّأ عند status='تم التوصيل') |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| deleted_at | TIMESTAMPTZ | NULL |
| deleted_by | TEXT | NULL |

**CHECK**: `status IN ('قيد الانتظار','قيد التحضير','جاهز','جاري التوصيل','تم التوصيل','ملغي')` (D-03)
**UNIQUE (partial)**: `ref_code WHERE ref_code != '' AND deleted_at IS NULL`
**INDEX**: `deliveries_order_id_idx ON (order_id)`
**INDEX**: `deliveries_assigned_driver_id_idx ON (assigned_driver_id)`
**INDEX**: `deliveries_status_idx ON (status)`

---

## 17. `driver_tasks` — مهام السائق

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| type | TEXT | NOT NULL |
| assigned_driver_id | INTEGER | NOT NULL → FK users.id ON DELETE RESTRICT |
| assigned_driver_username_cached | TEXT | NOT NULL |
| status | TEXT | DEFAULT 'pending' |
| related_entity_type | TEXT | NULL |
| related_entity_id | INTEGER | NULL |
| notes | TEXT | DEFAULT '' |
| assigned_by | TEXT | NOT NULL |
| completed_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | NULL |

**CHECK**: `type IN ('delivery','supplier_pickup','collection')`
**CHECK**: `status IN ('pending','in_progress','completed','cancelled')`
**CHECK**: `related_entity_type IN ('order','supplier_purchase','client_collection','other') OR related_entity_type IS NULL` (D-21)
**INDEX**: `driver_tasks_assigned_driver_id_idx ON (assigned_driver_id)`
**INDEX**: `driver_tasks_status_idx ON (status)`

---

## 18. `invoices` — الفواتير (D-30 محدَّث: snapshot frozen)

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | NOT NULL |
| date | DATE | NOT NULL (date de facturation) |
| delivery_date | DATE | NULL (D-35: date de livraison الإلزامية فرنسياً) |
| order_id | INTEGER | NOT NULL → FK orders.id ON DELETE RESTRICT |
| delivery_id | INTEGER | NOT NULL → FK deliveries.id ON DELETE RESTRICT |
| avoir_of_id | INTEGER | NULL → FK invoices.id ON DELETE RESTRICT (D-38: Avoir reference) |
| client_name_frozen | TEXT | NOT NULL (snapshot لحظة الإصدار) |
| client_phone_frozen | TEXT | DEFAULT '' |
| client_email_frozen | TEXT | DEFAULT '' |
| client_address_frozen | TEXT | DEFAULT '' |
| payment_method | TEXT | DEFAULT 'كاش' |
| seller_name_frozen | TEXT | DEFAULT '' |
| driver_name_frozen | TEXT | DEFAULT '' |
| total_ttc_frozen | NUMERIC(19,2) | NOT NULL (D-30: لا يتغيَّر بعد الإصدار) |
| total_ht_frozen | NUMERIC(19,2) | NOT NULL |
| tva_amount_frozen | NUMERIC(19,2) | NOT NULL |
| vat_rate_frozen | NUMERIC(5,2) | NOT NULL (vat_rate من settings وقت الإصدار) |
| prev_hash | TEXT | NULL (D-37: hash chain) |
| row_hash | TEXT | NOT NULL (D-37) |
| status | TEXT | DEFAULT 'مؤكد' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**CHECK (D-38)**: `(avoir_of_id IS NULL) OR (total_ttc_frozen < 0)` — Avoir يحمل total سالب.
**UNIQUE (partial)**: `ref_code WHERE ref_code != '' AND deleted_at IS NULL`
**ملاحظة (D-30)**: أصناف الفاتورة محفوظة في جدول منفصل `invoice_lines` (frozen snapshot). لا تُقرأ من `order_items` عند render — قانون anti-fraude 2018 يُلزم inaltérabilité.
**ملاحظة (D-37)**: `row_hash = SHA256(prev_hash || canonical(row_data))` محسوباً عبر trigger قبل INSERT. تُحدِّد inaltérabilité (loi anti-fraude TVA 2018).
**مراجع قانونية**: CGI art. 289 + BOI-TVA-DECLA-30-20-10 + loi 2015-1785 art. 88 + CGI art. 286-I-3° bis.

---

## 18b. `invoice_lines` — أصناف الفاتورة المُجمَّدة (D-30 — جديد)

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| invoice_id | INTEGER | NOT NULL → FK invoices.id ON DELETE RESTRICT |
| line_number | INTEGER | NOT NULL (1-based) |
| product_name_frozen | TEXT | NOT NULL |
| quantity | NUMERIC(19,2) | NOT NULL (موقَّعة للـ Avoir — quantity سالبة) |
| unit_price_ttc_frozen | NUMERIC(19,2) | NOT NULL |
| line_total_ttc_frozen | NUMERIC(19,2) | NOT NULL |
| vat_rate_frozen | NUMERIC(5,2) | NOT NULL |
| vat_amount_frozen | NUMERIC(19,2) | NOT NULL |
| ht_amount_frozen | NUMERIC(19,2) | NOT NULL |
| is_gift | BOOLEAN | DEFAULT false |
| vin_frozen | TEXT | DEFAULT '' |
| prev_hash | TEXT | NULL للسطر الأول في سلسلة `invoice_lines`، hex(sha256) لاحقاً (D-37 — Phase 4.1.2) |
| row_hash | TEXT | NOT NULL DEFAULT '' (الـDEFAULT bootstrap migration hack فقط؛ كل سطر يُدرَج عبر `issueInvoiceInTx` يحمل hex(sha256) فعلياً) — D-37 Phase 4.1.2 |

**UNIQUE**: `(invoice_id, line_number)`
**ملاحظة**: immutable — trigger `reject_mutation()` يمنع UPDATE.
**ملاحظة (D-37)**: سلسلة hash-chain مستقلّة على `invoice_lines` (مفتاح advisory `HASH_CHAIN_KEYS.invoice_lines = 1_000_004`)؛ `canonical` كل سطر يشمل كل الحقول المجمّدة: `invoiceId`, `lineNumber`, `productNameFrozen`, `quantity`, `unitPriceTtcFrozen`, `lineTotalTtcFrozen`, `vatRateFrozen`, `vatAmountFrozen`, `htAmountFrozen`, `isGift`, `vinFrozen`. حقول السطر نفسها تُضمَّن أيضاً في canonical الفاتورة الأم (مصفوفة `lines`) فأي تلاعب بحقل مجمّد على سطر يُكتشف مرّتين: في `verifyInvoiceLinesChain` و`verifyInvoicesChain`.

---

## 19. `invoice_sequence` — ترقيم الفواتير الشهري

| Column | Type | Constraints |
|--------|------|-------------|
| year | INTEGER | PK (composite) |
| month | INTEGER | PK (composite) |
| last_number | INTEGER | DEFAULT 0 |

---

## 20. `bonuses` — العمولات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | DATE | NOT NULL |
| user_id | INTEGER | NOT NULL → FK users.id ON DELETE RESTRICT (D-20) |
| username_cached | TEXT | NOT NULL (D-20) |
| role | TEXT | NOT NULL |
| order_id | INTEGER | NOT NULL → FK orders.id ON DELETE RESTRICT |
| order_item_id | INTEGER | NULL → FK order_items.id ON DELETE RESTRICT (D-29: NULL للـ driver bonus الموحَّد لكل توصيل) |
| delivery_id | INTEGER | NOT NULL → FK deliveries.id ON DELETE RESTRICT |
| item | TEXT | DEFAULT '' (name cached) |
| category | TEXT | DEFAULT '' |
| quantity | NUMERIC(19,2) | DEFAULT 0 |
| recommended_price | NUMERIC(19,2) | DEFAULT 0 (من order_items.recommended_price) |
| actual_price | NUMERIC(19,2) | DEFAULT 0 (من order_items.unit_price) |
| fixed_bonus | NUMERIC(19,2) | DEFAULT 0 |
| extra_bonus | NUMERIC(19,2) | DEFAULT 0 |
| total_bonus | NUMERIC(19,2) | DEFAULT 0 |
| status | TEXT | DEFAULT 'unsettled' |
| settlement_id | INTEGER | NULL → FK settlements.id |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | NULL |

**CHECK**: `role IN ('seller','driver')`
**CHECK**: `status IN ('unsettled','settled','retained')`
**UNIQUE (D-29)**:
- `(delivery_id, order_item_id, role) WHERE role='seller' AND deleted_at IS NULL` — seller bonus per item
- `(delivery_id, role) WHERE role='driver' AND deleted_at IS NULL` — عمولة واحدة فقط للسائق لكل توصيل، order_item_id=NULL
**INDEX**: `bonuses_user_id_idx ON (user_id)` (D-20)
**INDEX**: `bonuses_status_idx ON (status)`
**ملاحظة**: `order_id` NOT NULL دائماً (M12). لا تنقلب لـ NULL عند الإلغاء — soft-delete فقط.

---

## 21. `user_bonus_rates` — تجاوزات العمولة لكل مستخدم

| Column | Type | Constraints |
|--------|------|-------------|
| username | TEXT | PK → FK users.username ON DELETE RESTRICT (D-27) |
| seller_fixed | NUMERIC(19,2) | NULL |
| seller_percentage | NUMERIC(5,2) | NULL |
| driver_fixed | NUMERIC(19,2) | NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

**CHECK**: `seller_percentage >= 0 AND seller_percentage <= 100`
**CHECK**: `seller_fixed >= 0 OR seller_fixed IS NULL`
**CHECK**: `driver_fixed >= 0 OR driver_fixed IS NULL`

---

## 22. `settlements` — التسويات والمكافآت

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | DATE | NOT NULL |
| type | TEXT | NOT NULL |
| username | TEXT | NULL |
| description | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| settled_by | TEXT | NOT NULL |
| notes | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**ملاحظة**: المبلغ السالب = دين استرداد (عمولة مصروفة أُلغيت). قرار C2.

---

## 23. `profit_distribution_groups` — مجموعات التوزيع

| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| base_period_start | DATE | NULL |
| base_period_end | DATE | NULL |
| base_amount | NUMERIC(19,2) | NOT NULL |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**UNIQUE**: `(base_period_start, base_period_end) WHERE start IS NOT NULL AND end IS NOT NULL`
**ملاحظة**: كل فترة تُوزّع مرة واحدة فقط. قرار L5.

---

## 24. `profit_distributions` — سجلات التوزيع

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| group_id | TEXT | NOT NULL → FK profit_distribution_groups.id ON DELETE RESTRICT (D-27) |
| username | TEXT | NOT NULL |
| base_amount | NUMERIC(19,2) | NOT NULL |
| percentage | NUMERIC(5,2) | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 25. `treasury_accounts` — الصناديق المالية

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| type | TEXT | NOT NULL — `main_cash` \| `main_bank` \| `manager_box` \| `driver_custody` |
| name | TEXT | NOT NULL |
| owner_user_id | INTEGER | NULL → FK users.id ON DELETE RESTRICT — Phase 4.2: integer FK (replaces earlier `owner_username` text design) |
| parent_account_id | INTEGER | NULL (self-ref nullable) |
| balance | NUMERIC(19,2) | NOT NULL DEFAULT 0 |
| active | INTEGER | NOT NULL DEFAULT 1 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**CHECK**: schema enforces `type` via application code (no DB-level CHECK on `type` today; see schema [src/db/schema/treasury.ts](../../src/db/schema/treasury.ts)).

**Bootstrap (Phase 4.2)**:
- `/api/init` creates `main_cash` + `main_bank` rows (owner = admin / pm).
- Creating a user with `role='manager'` ⇒ users service idempotently creates the corresponding `manager_box`.
- Creating a user with `role='driver'` and `manager_id` set ⇒ users service idempotently creates the corresponding `driver_custody` parented to the manager's `manager_box`.
- Updating a driver's `manager_id` ⇒ rebinds `driver_custody.parent_account_id`; never creates a duplicate.
- Disabling a user or changing role ⇒ accounts are NOT deleted; treasury operations on them are gated at the service layer.
- Migration `0009_users_manager_id.sql` backfills `manager_box` for every existing `role='manager'` AND `active=true` user that lacks one.

---

## 26. `treasury_movements` — حركات الصناديق

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL — Paris ISO YYYY-MM-DD |
| category | TEXT | NOT NULL |
| from_account_id | INTEGER | NULL → FK treasury_accounts.id ON DELETE RESTRICT |
| to_account_id | INTEGER | NULL → FK treasury_accounts.id ON DELETE RESTRICT |
| amount | NUMERIC(19,2) | NOT NULL — signed |
| reference_type | TEXT | NULL |
| reference_id | INTEGER | NULL |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Categories used so far**:
- `sale_collection` (Phase 4.2): inflow from confirm-delivery; `from_account_id = NULL`, `to_account_id = driver_custody`. Logged inside the same tx as confirm-delivery via [src/modules/treasury/bridge.ts](../../src/modules/treasury/bridge.ts).
- `driver_handover` (Phase 4.2): transfer; `from = driver_custody`, `to = manager_box`. Logged via [src/modules/treasury/handover.ts](../../src/modules/treasury/handover.ts).

**Reserved categories (later tranches)**: `supplier_payment`, `expense`, `settlement`, `reward`, `profit_distribution`, `manager_settlement`, `funding`, `bank_deposit`, `bank_withdrawal`, `refund`, `reconciliation`. (D-10 — `supplier_credit` removed; managed in `suppliers.credit_due_from_supplier`.)

**Append-only (D-58)**: `treasury_movements_no_update` trigger in `0001_immutable_audits.sql` rejects every UPDATE. Hash-chain on this table is intentionally NOT yet implemented (deferred).

---

## 27. `payment_schedule` — جدول الدفعات الآجلة

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| order_id | INTEGER | NOT NULL → FK orders.id |
| due_date | DATE | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| status | TEXT | DEFAULT 'pending' |
| paid_at | TIMESTAMPTZ | NULL |

**CHECK**: `status IN ('pending','paid','overdue')`

---

## 28. `notifications` — التنبيهات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL → FK users.id |
| type | TEXT | NOT NULL |
| title | TEXT | NOT NULL |
| body | TEXT | DEFAULT '' |
| entity_type | TEXT | NULL |
| entity_id | INTEGER | NULL |
| read | BOOLEAN | DEFAULT false |
| read_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 29. `notification_preferences` — تفضيلات التنبيهات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL → FK users.id |
| notification_type | TEXT | NOT NULL |
| channel | TEXT | NOT NULL |
| enabled | BOOLEAN | DEFAULT true |

**CHECK**: `channel IN ('in_app')` (D-22 — `email` و `push` محذوفان؛ لا SMTP ولا Web Push في stack الـ MVP. العمود مُحتفَظ به للتوسعة)
**UNIQUE**: `(user_id, notification_type, channel)`

---

## 30. `activity_log` — سجل النشاطات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| timestamp | TIMESTAMPTZ | DEFAULT NOW() |
| user_id | INTEGER | NULL |
| username | TEXT | NOT NULL |
| action | TEXT | NOT NULL |
| entity_type | TEXT | NOT NULL |
| entity_id | INTEGER | NULL |
| entity_ref_code | TEXT | NULL |
| details | JSONB | NULL |
| ip_address | TEXT | NULL |
| prev_hash | TEXT | NULL (D-37: hash chain) |
| row_hash | TEXT | NOT NULL (D-37) |

**CHECK**: `action IN ('create','update','delete','cancel','confirm','collect','login','logout')`
**IMMUTABLE (D-58)**: trigger `reject_mutation()` يرفض UPDATE. فقط INSERT + SELECT + DELETE-cron-retention.

---

## 31. `permissions` — الصلاحيات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| role | TEXT | NOT NULL |
| resource | TEXT | NOT NULL |
| action | TEXT | NOT NULL |
| allowed | BOOLEAN | DEFAULT false |

**UNIQUE**: `(role, resource, action)`

---

## 32. `cancellations` — سجل الإلغاءات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| order_id | INTEGER | NOT NULL → FK orders.id |
| cancelled_by | TEXT | NOT NULL |
| cancelled_at | TIMESTAMPTZ | DEFAULT NOW() |
| reason | TEXT | NOT NULL |
| refund_amount | NUMERIC(19,2) | DEFAULT 0 |
| return_to_stock | BOOLEAN | NOT NULL |
| seller_bonus_action | TEXT | NOT NULL |
| driver_bonus_action | TEXT | NOT NULL |
| delivery_status_before | TEXT | NULL |
| notes | TEXT | NULL |
| prev_hash | TEXT | NULL (D-37: hash chain) |
| row_hash | TEXT | NOT NULL (D-37) |

**CHECK**: `seller_bonus_action IN ('keep','cancel_as_debt','cancel_unpaid')`
**CHECK**: `driver_bonus_action IN ('keep','cancel_as_debt','cancel_unpaid')`
**IMMUTABLE (D-58)**: trigger `reject_mutation()` يرفض UPDATE.
**ملاحظة**: يعكس شاشة الإلغاء C1 بـ 3 خيارات إلزامية.

---

## 32b. `idempotency_keys` — منع تكرار الـ mutations (D-16 + D-57)

| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | NOT NULL (UUID يُرسَل في header `Idempotency-Key`) |
| endpoint | TEXT | NOT NULL (e.g. 'POST /api/orders/123/cancel') |
| username | TEXT | NOT NULL → FK users.username للتدقيق |
| request_hash | TEXT | NOT NULL (SHA-256 من body — detect key collision مع body مختلف) |
| response | JSONB | NOT NULL (الرد السابق، يُعاد كما هو عند إعادة الإرسال) |
| status_code | INTEGER | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| expires_at | TIMESTAMPTZ | NOT NULL |

**PRIMARY KEY (D-57)**: `(key, endpoint)` — نفس الـ key جائز عبر endpoints مختلفة.
**INDEX**: `idempotency_keys_expires_idx ON (expires_at)` (لـ cron cleanup)

**السلوك**:
- TTL = 24 ساعة.
- في بداية كل POST mutation حرج (`/api/orders`, `/api/orders/[id]/cancel`, `/api/orders/[id]/collect`, `/api/settlements`, `/api/distributions`, `/api/payments`): الـ middleware يفحص الـ key.
- إذا موجود + `request_hash` يطابق → يُعاد `response` و `status_code` كما هو. لا re-execution.
- إذا موجود + `request_hash` مختلف → 409 `IDEMPOTENCY_KEY_MISMATCH`.
- إذا غير موجود → يُنفَّذ الـ mutation، ثم يُدرَج الصف في نهاية الـ transaction.
- cleanup عبر `/api/cron/daily`: `DELETE FROM idempotency_keys WHERE expires_at < NOW()`.

---

## 33. `inventory_counts` — الجرد الدوري

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| product_id | INTEGER | NOT NULL → FK products.id |
| counted_by | TEXT | NOT NULL |
| count_date | DATE | NOT NULL |
| expected_quantity | NUMERIC(19,2) | NOT NULL |
| actual_quantity | NUMERIC(19,2) | NOT NULL |
| variance | NUMERIC(19,2) | NOT NULL |
| notes | TEXT | DEFAULT '' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 34. `voice_logs` — سجل الإدخال الصوتي

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | DATE | NOT NULL |
| username | TEXT | NOT NULL |
| transcript | TEXT | DEFAULT '' |
| normalized_text | TEXT | DEFAULT '' |
| action_type | TEXT | DEFAULT '' |
| action_id | INTEGER | NULL |
| status | TEXT | DEFAULT 'pending' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| debug_json | JSONB | NULL |

**CHECK (D-63)**: `status IN ('pending', 'processed', 'saved', 'abandoned', 'edited_and_saved', 'groq_error')`
**ملاحظة**: Client يُرسل `PUT /api/voice/cancel` عند إغلاق VoiceConfirm بلا حفظ → `status='abandoned'`.

---

## 35. `entity_aliases` — أسماء بديلة للكيانات (صوت)

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| entity_type | TEXT | NOT NULL |
| entity_id | INTEGER | NOT NULL |
| alias | TEXT | NOT NULL |
| normalized_alias | TEXT | NOT NULL |
| source | TEXT | DEFAULT 'user' |
| frequency | INTEGER | DEFAULT 1 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**UNIQUE**: `(entity_type, normalized_alias)`

---

## 36. `ai_corrections` + `ai_patterns` — تعلم الصوت

**ai_corrections:**

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | DATE | NOT NULL |
| username | TEXT | NOT NULL |
| transcript | TEXT | NOT NULL |
| ai_output | TEXT | NOT NULL |
| user_correction | TEXT | NOT NULL |
| action_type | TEXT | NOT NULL |
| field_name | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**ai_patterns:**

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| pattern_type | TEXT | NOT NULL |
| spoken_text | TEXT | NOT NULL |
| correct_value | TEXT | NOT NULL |
| field_name | TEXT | NOT NULL |
| frequency | INTEGER | DEFAULT 1 |
| last_used | TIMESTAMPTZ | DEFAULT NOW() |
| username | TEXT | DEFAULT '' |

**UNIQUE**: `(spoken_text, correct_value, field_name, username)`

---

## 37. `voice_rate_limits` — عدَّاد Voice requests (D-73)

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL → FK users.id ON DELETE RESTRICT |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**INDEX**: `voice_rate_limits_user_time_idx ON (user_id, created_at DESC)` — لـ sliding window query.

**السلوك (D-73)**:
- `POST /api/v1/voice/process` قبل استدعاء Groq:
  ```sql
  SELECT COUNT(*) FROM voice_rate_limits
   WHERE user_id = :uid AND created_at >= NOW() - INTERVAL '60 seconds';
  -- إذا >= 10 → 429 VOICE_RATE_LIMIT
  INSERT INTO voice_rate_limits (user_id) VALUES (:uid);
  ```
- Cleanup عبر `/api/cron/hourly`: `DELETE FROM voice_rate_limits WHERE created_at < NOW() - INTERVAL '90 seconds'`.

**ملاحظة (D-73 يُلغي D-33)**: in-memory hybrid كان مُعطَّلاً لأن Vercel stateless — cold-start كل invocation تقريباً = reset النافذة. DB-only يضمن الحماية الفعلية.

---

## العلاقات (Foreign Keys)

**ملاحظة عامة**: `DELETE` لا يحدث فعلياً على الجداول المالية (D-04). الحذف الناعم (`UPDATE SET deleted_at=NOW()`) فقط. ON DELETE السياسات أدناه تحمي من أي DELETE عرضي.

### FKs على معرِّفات (D-20)

| From | Column | → To | Column | ON DELETE |
|------|--------|------|--------|-----------|
| product_images | product_id | products | id | RESTRICT (D-27 — كان CASCADE، يُحاكى يدوياً في withTx) |
| order_items | order_id | orders | id | RESTRICT (D-27 — كان CASCADE، يُحاكى يدوياً في withTx) |
| order_items | product_id | products | id | RESTRICT (D-20) |
| gift_pool | product_id | products | id | RESTRICT |
| orders | client_id | clients | id | RESTRICT (D-20) |
| payments | client_id | clients | id | RESTRICT (D-20) |
| payments | order_id | orders | id | RESTRICT |
| supplier_payments | purchase_id | purchases | id | RESTRICT |
| purchases | supplier_id | suppliers | id | RESTRICT (D-20) |
| purchases | product_id | products | id | RESTRICT |
| deliveries | order_id | orders | id | RESTRICT |
| deliveries | client_id | clients | id | RESTRICT (D-20) |
| deliveries | assigned_driver_id | users | id | RESTRICT |
| driver_tasks | assigned_driver_id | users | id | RESTRICT |
| invoices | order_id | orders | id | RESTRICT |
| invoices | delivery_id | deliveries | id | RESTRICT |
| bonuses | user_id | users | id | RESTRICT (D-20) |
| bonuses | order_id | orders | id | RESTRICT |
| bonuses | order_item_id | order_items | id | RESTRICT |
| bonuses | delivery_id | deliveries | id | RESTRICT |
| bonuses | settlement_id | settlements | id | RESTRICT |
| user_bonus_rates | user_id | users | id | RESTRICT (D-27 — كان CASCADE) |
| profit_distributions | group_id | profit_distribution_groups | id | RESTRICT (D-27 — كان CASCADE) |
| profit_distributions | user_id | users | id | RESTRICT (D-20) |
| cancellations | order_id | orders | id | RESTRICT |
| cancellations | cancelled_by_id | users | id | RESTRICT (D-20) |
| inventory_counts | product_id | products | id | RESTRICT |
| notifications | user_id | users | id | RESTRICT (D-27 — كان CASCADE) |
| notification_preferences | user_id | users | id | RESTRICT (D-27 — كان CASCADE) |
| treasury_accounts | owner_user_id | users | id | RESTRICT |
| treasury_accounts | parent_account_id | treasury_accounts | id | SET NULL |
| treasury_movements | from_account_id | treasury_accounts | id | RESTRICT |
| treasury_movements | to_account_id | treasury_accounts | id | RESTRICT |
| payment_schedule | order_id | orders | id | RESTRICT |
| idempotency_keys | — | — | — | — (no FKs — standalone) |
| price_history | product_id | products | id | RESTRICT (D-20) |
| price_history | purchase_id | purchases | id | RESTRICT |

**سياسة CASCADE مُلغاة (D-27 — Phase 0c)**: **كل FK = RESTRICT**. CASCADE كان فخّاً لأنه لا يُطلَق على UPDATE (soft-delete)، ويعرِّض البيانات المالية لـ DELETE عرضي. الـ cascade يُحاكى يدوياً في `withTx`:

```ts
// مثال: soft-delete order
await withTx(async (tx) => {
  await tx.update(orders).set({ deletedAt: now() }).where(eq(orders.id, orderId));
  await tx.update(orderItems).set({ deletedAt: now() }).where(eq(orderItems.orderId, orderId));
  await tx.update(deliveries).set({ deletedAt: now() }).where(eq(deliveries.orderId, orderId));
  // ...
});
```

الجداول المُعدَّلة من CASCADE إلى RESTRICT: `order_items.order_id`، `product_images.product_id`، `notifications.user_id`، `user_bonus_rates.username`، `profit_distributions.group_id`.

---

## Soft-Delete Columns

كل جدول مالي أو حركي يحمل هذه الأعمدة:

```
deleted_at    TIMESTAMPTZ NULL
deleted_by    TEXT NULL
deleted_reason TEXT NULL
```

الجداول المعنية: `orders`, `order_items`, `deliveries`, `driver_tasks`, `invoices`, `bonuses`, `settlements`, `profit_distributions`, `profit_distribution_groups`, `payments`, `supplier_payments`, `purchases`, `expenses`, `treasury_accounts`, `treasury_movements`, `inventory_counts`, `cancellations`, `clients`, `suppliers`, `products`, `users`, `permissions`.

### Views فعّالة (الاستعلامات الافتراضية)

```sql
CREATE VIEW active_orders AS SELECT * FROM orders WHERE deleted_at IS NULL;
CREATE VIEW active_deliveries AS SELECT * FROM deliveries WHERE deleted_at IS NULL;
-- ... لكل جدول يحتاج views افتراضية
```

الاستعلامات في الكود تمر عبر `active_*` views افتراضياً. استعلامات التدقيق/التاريخ تقرأ الجداول الخام.

---

## Drizzle Setup

### Driver: WebSocket Pool للكتابات

```ts
// src/db/client.ts
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;  // Node.js env
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export async function withTx<T>(fn: (tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
```

### HTTP Driver للقراءات (اختياري، للأداء)

```ts
// src/db/client-read.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
export const dbRead = drizzle(sql);
```

### Migrations

```bash
npx drizzle-kit generate   # توليد SQL من schema TypeScript
npx drizzle-kit migrate    # تطبيق على قاعدة البيانات
```

ملفات migrations في `src/db/migrations/` مُلتزمة في الـ repo.

### أسماء مخبَّأة (cached denormalized — D-20)

**أسلوب v2 مُحدَّث**: كل الأعمدة السابقة التي كانت تخزِّن اسم كيان نصياً (مثل `orders.client_name`) استُبدلت بـ `*_id FK` + `*_name_cached TEXT`:

| From | FK column | Cached name |
|------|-----------|-------------|
| orders | client_id | client_name_cached, client_phone_cached |
| order_items | product_id | product_name_cached |
| deliveries | client_id + assigned_driver_id | client_name_cached, assigned_driver_username_cached |
| purchases | supplier_id + product_id | supplier_name_cached, item_name_cached |
| bonuses | user_id | username_cached |
| payments | client_id | client_name_cached |
| driver_tasks | assigned_driver_id | assigned_driver_username_cached |
| price_history | product_id | product_name_cached |
| invoices | order_id + delivery_id (JOIN للاسم) | — |
| cancellations | cancelled_by_id | cancelled_by_username_cached |

**سلوك عند إعادة تسمية الكيان الأصلي** (D-20):
- **لا تحديث** للـ `*_name_cached` في الجداول التابعة. السجل التاريخي يعرض الاسم وقت إنشائه (صحيح محاسبياً).
- الـ dashboards الحية تعرض الاسم الحالي عبر `JOIN ON *_id` عند العرض.
- استعلامات البحث تستخدم الاسم الحالي عبر JOIN، مع fallback على `*_name_cached` إذا الكيان الأصلي معطَّل (`active=false`).

**نتيجة**: لا حاجة لتحديث ذري متعدد الجداول (القاعدة القديمة H4 ألغيت فعلياً — الأسماء مخبَّأة بقصد).

---

## البيانات الافتراضية (Seed Data)

### إعدادات المتجر (settings)

| Key | Value |
|-----|-------|
| shop_name | VITESSE ECO SAS |
| shop_legal_form | SAS |
| shop_siren | 100 732 247 |
| shop_siret | 100 732 247 00018 |
| shop_ape | 46.90Z |
| shop_vat_number | FR43100732247 |
| shop_address | 32 Rue du Faubourg du Pont Neuf |
| shop_city | 86000 Poitiers, France |
| shop_email | contact@vitesse-eco.fr |
| shop_website | www.vitesse-eco.fr |
| shop_iban | _(placeholder — reject invoice generation until filled)_ |
| shop_bic | _(placeholder — reject invoice generation until filled)_ |
| shop_capital_social | _(placeholder — D-35 إلزامي للـ SAS)_ |
| shop_rcs_city | Poitiers |
| shop_rcs_number | _(placeholder — e.g. "100 732 247")_ |
| shop_penalty_rate_annual | 10.5 |
| shop_recovery_fee_eur | 40 |
| vat_rate | 20 |
| invoice_currency | EUR |
| seller_bonus_fixed | 10 |
| seller_bonus_percentage | 40 |
| driver_bonus_fixed | 10 |
| max_discount_seller_pct | 5 |
| max_discount_manager_pct | 15 |
| vin_required_categories | ["دراجات كهربائية","دراجات عادية"] |
| driver_custody_cap_eur | 2000 |
| activity_log_retention_days | 90 |
| voice_logs_retention_days | 30 |
| read_notifications_retention_days | 60 |
| voice_rate_limit_per_min | 10 |
| voice_max_audio_seconds | 30 |
| voice_min_audio_ms | 1500 |
| auto_refresh_interval_ms | 90000 |
| sku_limit | 500 (D-25) |
| max_images_per_product | 3 (D-25) |
| neon_hours_used_this_month | 0 (D-42) |

**ملاحظة**: مفتاح `invoice_mode` **محذوف** (D-09) — قالب الفاتورة ثابت، وسلوك إلغاء الفاتورة (soft) قاعدة تجارية لا مفتاح.
**ملاحظة (D-28)**: كل المفاتيح الـ enum موثَّقة أعلاه + في CHECK constraint على `settings.key`. Settings غير موجود في القائمة = خطأ migration.
**ملاحظة (D-35)**: `shop_capital_social`, `shop_rcs_number`, `shop_penalty_rate_annual`, `shop_recovery_fee_eur` **placeholders** — تمنع توليد أول فاتورة حتى تُعبَّأ (إلزام فرنسي).

### المستخدم الافتراضي

| Field | Value |
|-------|-------|
| username | admin |
| password | **عشوائي 24 حرف** — يُولَّد ويُطبع مرة واحدة في stdout عند `/api/init` (D-24). لا `admin123`. |
| name | مدير المشروع |
| role | pm |

### صناديق افتراضية (treasury_accounts)

| Name | Type | Owner |
|------|------|-------|
| الصندوق الرئيسي — كاش | main_cash | (GM) |
| الصندوق الرئيسي — بنك | main_bank | (GM) |
