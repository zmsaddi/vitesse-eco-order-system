# نموذج البيانات — Database Schema v2

> **رقم العنصر**: #02 | **المحور**: أ | **الحالة**: قيد التحديث
> **قاعدة البيانات**: PostgreSQL (Neon Serverless)
> **ORM**: Drizzle ORM + @neondatabase/serverless
> **عدد الجداول**: ~35
> **الدقة المالية**: NUMERIC(19,2) — كل الأرقام TTC
> **التواريخ**: DATE / TIMESTAMPTZ (المنطقة: Europe/Paris)

---

## فهرس الجداول

| # | المجموعة | الجداول |
|---|---------|---------|
| 1-2 | المستخدمين والإعدادات | users, settings |
| 3-5 | المنتجات والكتالوج | products, product_images, product_commission_rules |
| 6-7 | الموردين | suppliers, supplier_payments |
| 8 | العملاء | clients |
| 9-12 | الطلبات (يحل محل sales) | orders, order_items, gift_pool, payments |
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
| 33 | الجرد | inventory_counts |
| 34-36 | النظام الصوتي | voice_logs, ai_corrections, ai_patterns, entity_aliases |

---

## 1. `users` — المستخدمين

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| username | TEXT | UNIQUE, NOT NULL |
| password | TEXT | NOT NULL (bcrypt) |
| name | TEXT | NOT NULL |
| role | TEXT | NOT NULL, DEFAULT 'seller' |
| active | BOOLEAN | DEFAULT true |
| profit_share_pct | NUMERIC(5,2) | DEFAULT 0 |
| profit_share_start | DATE | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**CHECK**: `role IN ('pm','gm','manager','seller','driver','stock_keeper')`

---

## 2. `settings` — الإعدادات

| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |

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
| product_id | INTEGER | NOT NULL → FK products.id ON DELETE CASCADE |
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
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**UNIQUE**: `(name, phone) WHERE phone != ''`

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
| ref_code | TEXT | NOT NULL |
| date | DATE | NOT NULL |
| client_name | TEXT | NOT NULL |
| client_phone | TEXT | DEFAULT '' |
| status | TEXT | DEFAULT 'محجوز' |
| payment_method | TEXT | NOT NULL |
| total_amount | NUMERIC(19,2) | DEFAULT 0 |
| paid_amount | NUMERIC(19,2) | DEFAULT 0 |
| remaining | NUMERIC(19,2) | DEFAULT 0 |
| payment_status | TEXT | DEFAULT 'pending' |
| down_payment | NUMERIC(19,2) | DEFAULT 0 |
| cancel_reason | TEXT | NULL |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**CHECK**: `status IN ('محجوز','قيد_التحضير','جاهز','مؤكد','ملغي')`
**CHECK**: `payment_method IN ('كاش','بنك','آجل')`
**CHECK**: `payment_status IN ('pending','partial','paid','cancelled')`
**UNIQUE**: `ref_code WHERE ref_code != ''`
**INDEX**: `orders_client_name_idx ON (client_name)`
**INDEX**: `orders_payment_status_idx ON (payment_status)`

---

## 10. `order_items` — أصناف الطلب

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| order_id | INTEGER | NOT NULL → FK orders.id ON DELETE CASCADE |
| product_name | TEXT | NOT NULL |
| category | TEXT | DEFAULT '' |
| quantity | NUMERIC(19,2) | NOT NULL |
| unit_price | NUMERIC(19,2) | NOT NULL |
| cost_price | NUMERIC(19,2) | DEFAULT 0 |
| line_total | NUMERIC(19,2) | NOT NULL |
| discount_type | TEXT | NULL |
| discount_value | NUMERIC(19,2) | DEFAULT 0 |
| discount_reason | TEXT | DEFAULT '' |
| is_gift | BOOLEAN | DEFAULT false |
| gift_approved_by | TEXT | NULL |
| vin | TEXT | DEFAULT '' |
| commission_amount | NUMERIC(19,2) | DEFAULT 0 |

**CHECK**: `discount_type IN ('percent','fixed') OR discount_type IS NULL`
**INDEX**: `order_items_product_name_idx ON (product_name)`

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
| client_name | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| order_id | INTEGER | NULL → FK orders.id |
| type | TEXT | DEFAULT 'collection' |
| payment_method | TEXT | DEFAULT 'كاش' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**CHECK**: `type IN ('collection','refund','advance')`
**CHECK**: `payment_method IN ('كاش','بنك')`

---

## 13. `purchases` — المشتريات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | DEFAULT '' |
| date | DATE | NOT NULL |
| supplier | TEXT | NOT NULL |
| item | TEXT | NOT NULL |
| category | TEXT | DEFAULT '' |
| quantity | NUMERIC(19,2) | NOT NULL |
| unit_price | NUMERIC(19,2) | NOT NULL |
| total | NUMERIC(19,2) | NOT NULL |
| payment_method | TEXT | DEFAULT 'كاش' |
| paid_amount | NUMERIC(19,2) | DEFAULT 0 |
| payment_status | TEXT | DEFAULT 'paid' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**UNIQUE**: `ref_code WHERE ref_code != ''`
**INDEX**: `purchases_supplier_idx ON (supplier)`

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
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

---

## 16. `deliveries` — التوصيلات

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | DEFAULT '' |
| date | DATE | NOT NULL |
| order_id | INTEGER | NOT NULL → FK orders.id |
| client_name | TEXT | NOT NULL |
| client_phone | TEXT | DEFAULT '' |
| address | TEXT | DEFAULT '' |
| status | TEXT | DEFAULT 'قيد الانتظار' |
| assigned_driver | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**CHECK**: `status IN ('قيد الانتظار','قيد_التحضير','جاهز','جاري التوصيل','تم التوصيل','ملغي')`
**UNIQUE**: `ref_code WHERE ref_code != ''`

---

## 17. `driver_tasks` — مهام السائق

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| type | TEXT | NOT NULL |
| assigned_driver | TEXT | NOT NULL |
| status | TEXT | DEFAULT 'pending' |
| related_entity_type | TEXT | NULL |
| related_entity_id | INTEGER | NULL |
| notes | TEXT | DEFAULT '' |
| assigned_by | TEXT | NOT NULL |
| completed_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**CHECK**: `type IN ('delivery','supplier_pickup','collection')`
**CHECK**: `status IN ('pending','in_progress','completed','cancelled')`

---

## 18. `invoices` — الفواتير

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | NOT NULL |
| date | DATE | NOT NULL |
| order_id | INTEGER | NOT NULL → FK orders.id |
| delivery_id | INTEGER | NOT NULL → FK deliveries.id |
| client_name | TEXT | NOT NULL |
| client_phone | TEXT | DEFAULT '' |
| client_email | TEXT | DEFAULT '' |
| client_address | TEXT | DEFAULT '' |
| payment_method | TEXT | DEFAULT 'كاش' |
| seller_name | TEXT | DEFAULT '' |
| driver_name | TEXT | DEFAULT '' |
| status | TEXT | DEFAULT 'مؤكد' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**ملاحظة**: أصناف الفاتورة تُقرأ من order_items عبر order_id — لا تُكرر هنا.
**ملاحظة**: TVA تُحسب عند توليد PDF فقط — لا تُخزّن. قرار H1.
**UNIQUE**: `ref_code WHERE ref_code != ''`

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
| username | TEXT | NOT NULL |
| role | TEXT | NOT NULL |
| order_id | INTEGER | NOT NULL → FK orders.id |
| delivery_id | INTEGER | NOT NULL → FK deliveries.id |
| item | TEXT | DEFAULT '' |
| category | TEXT | DEFAULT '' |
| quantity | NUMERIC(19,2) | DEFAULT 0 |
| recommended_price | NUMERIC(19,2) | DEFAULT 0 |
| actual_price | NUMERIC(19,2) | DEFAULT 0 |
| fixed_bonus | NUMERIC(19,2) | DEFAULT 0 |
| extra_bonus | NUMERIC(19,2) | DEFAULT 0 |
| total_bonus | NUMERIC(19,2) | DEFAULT 0 |
| settled | BOOLEAN | DEFAULT false |
| settlement_id | INTEGER | NULL |

**UNIQUE**: `(delivery_id, role, item)` — عمولة لكل صنف لكل دور لكل توصيل
**ملاحظة**: order_id = NOT NULL دائماً. قرار M12.

---

## 21. `user_bonus_rates` — تجاوزات العمولة لكل مستخدم

| Column | Type | Constraints |
|--------|------|-------------|
| username | TEXT | PK → FK users.username ON DELETE CASCADE |
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
| group_id | TEXT | NOT NULL → FK profit_distribution_groups.id ON DELETE CASCADE |
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
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL |
| owner_username | TEXT | NULL |
| parent_account_id | INTEGER | NULL → FK treasury_accounts.id |
| balance | NUMERIC(19,2) | DEFAULT 0 |
| last_reconciled_at | TIMESTAMPTZ | NULL |

**CHECK**: `type IN ('main_cash','main_bank','manager_box','driver_custody')`

---

## 26. `treasury_movements` — حركات الصناديق

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| from_account_id | INTEGER | NULL → FK treasury_accounts.id |
| to_account_id | INTEGER | NULL → FK treasury_accounts.id |
| type | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| date | DATE | NOT NULL |
| category | TEXT | NOT NULL |
| reference_type | TEXT | NULL |
| reference_id | INTEGER | NULL |
| description | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| reconciled | BOOLEAN | DEFAULT false |

**CHECK**: `type IN ('inflow','outflow','transfer','reconciliation')`
**CHECK**: `category IN ('sale_collection','supplier_payment','expense','settlement','reward','profit_distribution','driver_handover','manager_settlement','funding','bank_deposit','bank_withdrawal','refund','supplier_credit')`

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

**CHECK**: `channel IN ('in_app','email','push')`
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

**CHECK**: `action IN ('create','update','delete','cancel','confirm','collect','login','logout')`

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

**CHECK**: `seller_bonus_action IN ('keep','cancel_as_debt','cancel_unpaid')`
**CHECK**: `driver_bonus_action IN ('keep','cancel_as_debt','cancel_unpaid')`
**ملاحظة**: يعكس شاشة الإلغاء C1 بـ 3 خيارات إلزامية.

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

## العلاقات (Foreign Keys)

| From | Column | → To | Column | ON DELETE |
|------|--------|------|--------|-----------|
| product_images | product_id | products | id | CASCADE |
| order_items | order_id | orders | id | CASCADE |
| gift_pool | product_id | products | id | RESTRICT |
| payments | order_id | orders | id | SET NULL |
| supplier_payments | purchase_id | purchases | id | RESTRICT |
| deliveries | order_id | orders | id | RESTRICT |
| invoices | order_id | orders | id | RESTRICT |
| invoices | delivery_id | deliveries | id | RESTRICT |
| bonuses | order_id | orders | id | RESTRICT |
| bonuses | delivery_id | deliveries | id | RESTRICT |
| user_bonus_rates | username | users | username | CASCADE |
| profit_distributions | group_id | profit_distribution_groups | id | CASCADE |
| cancellations | order_id | orders | id | RESTRICT |
| inventory_counts | product_id | products | id | RESTRICT |
| notifications | user_id | users | id | CASCADE |
| notification_preferences | user_id | users | id | CASCADE |
| treasury_accounts | parent_account_id | treasury_accounts | id | SET NULL |
| treasury_movements | from_account_id | treasury_accounts | id | RESTRICT |
| treasury_movements | to_account_id | treasury_accounts | id | RESTRICT |
| payment_schedule | order_id | orders | id | CASCADE |

**ملاحظة**: ON DELETE = RESTRICT بدل CASCADE لمعظم العلاقات لأن الحذف ناعم دائماً (قرار H5).

### مراجع نصية (بدون FK — تُحدّث ذرياً عند تغيير الاسم)

| From | Column | → To | Column |
|------|--------|------|--------|
| orders | client_name | clients | name |
| purchases | supplier | suppliers | name |
| order_items | product_name | products | name |
| deliveries | client_name | clients | name |
| deliveries | assigned_driver | users | username |
| bonuses | username | users | username |
| settlements | username | users | username |
| price_history | product_name | products | name |

**ملاحظة**: عند تغيير اسم كيان → تحديث شامل ذري لكل المراجع (قرار H4).

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
| shop_address | 32 Rue du Faubourg du Pont Neuf |
| shop_city | 86000 Poitiers, France |
| shop_email | contact@vitesse-eco.fr |
| vat_rate | 20 |
| invoice_currency | EUR |
| seller_bonus_fixed | 10 |
| seller_bonus_percentage | 50 |
| driver_bonus_fixed | 5 |

### المستخدم الافتراضي

| Field | Value |
|-------|-------|
| username | admin |
| name | مدير المشروع |
| role | pm |

### صناديق افتراضية (treasury_accounts)

| Name | Type | Owner |
|------|------|-------|
| الصندوق الرئيسي — كاش | main_cash | (GM) |
| الصندوق الرئيسي — بنك | main_bank | (GM) |
