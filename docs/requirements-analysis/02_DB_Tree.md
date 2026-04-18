# Database Tree & Workflow — VITESSE ECO SAS

> **Database Engine**: PostgreSQL (Neon Serverless)
> **ORM**: @vercel/postgres (direct SQL)
> **Total Tables**: 23
> **Numeric Precision**: NUMERIC(19,2) for money, NUMERIC(5,2) for percentages
> **Date Format**: ISO 8601 TEXT (YYYY-MM-DD)

---

## Table of Contents

1. [Database Tree (All Tables)](#database-tree)
2. [Relationships & Foreign Keys](#relationships--foreign-keys)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Business Workflow](#business-workflow)
5. [Indexes & Constraints](#indexes--constraints)
6. [Default Settings & Seed Data](#default-settings--seed-data)

---

## Database Tree

### 1. `users`
> Authentication and role-based access control

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| username | TEXT | UNIQUE, NOT NULL |
| password | TEXT | NOT NULL (bcrypt hashed) |
| name | TEXT | NOT NULL |
| role | TEXT | NOT NULL, DEFAULT 'seller' — values: admin, manager, seller, driver |
| active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| profit_share_pct | NUMERIC(5,2) | DEFAULT 0 |
| profit_share_start | TEXT | NULL |

---

### 2. `settings`
> Key-value configuration store

| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |

---

### 3. `products`
> Product catalog and inventory

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | TEXT | UNIQUE, NOT NULL |
| category | TEXT | DEFAULT '' |
| unit | TEXT | DEFAULT '' |
| buy_price | NUMERIC(19,2) | DEFAULT 0 |
| sell_price | NUMERIC(19,2) | DEFAULT 0 |
| stock | NUMERIC(19,2) | DEFAULT 0 |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| low_stock_threshold | INTEGER | DEFAULT 3 |
| description_ar | TEXT | DEFAULT '' |

---

### 4. `suppliers`
> Supplier information

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | TEXT | NOT NULL |
| phone | TEXT | DEFAULT '' |
| address | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**Unique**: `(name, phone)` WHERE phone != ''

---

### 5. `clients`
> Customer information

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| name | TEXT | NOT NULL |
| phone | TEXT | DEFAULT '' |
| address | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| email | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| latin_name | TEXT | DEFAULT '' |
| description_ar | TEXT | DEFAULT '' |

**Unique**: `(name, phone)` WHERE phone != '' ; `(name, email)` WHERE email != ''

---

### 6. `purchases`
> Product purchases from suppliers

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| supplier | TEXT | NOT NULL |
| item | TEXT | NOT NULL |
| category | TEXT | DEFAULT '' |
| quantity | NUMERIC(19,2) | NOT NULL |
| unit_price | NUMERIC(19,2) | NOT NULL |
| total | NUMERIC(19,2) | NOT NULL |
| payment_type | TEXT | DEFAULT 'كاش' |
| notes | TEXT | DEFAULT '' |
| ref_code | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| paid_amount | NUMERIC(19,2) | DEFAULT 0 |
| payment_status | TEXT | DEFAULT 'paid' |

**Unique**: `ref_code` WHERE ref_code != ''

---

### 7. `supplier_payments`
> Audit trail for partial supplier payments

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| purchase_id | INTEGER | NOT NULL → FK purchases.id |
| date | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| payment_method | TEXT | DEFAULT 'كاش' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

---

### 8. `sales`
> Product sales to clients

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| client_name | TEXT | NOT NULL |
| item | TEXT | NOT NULL |
| quantity | NUMERIC(19,2) | NOT NULL |
| cost_price | NUMERIC(19,2) | DEFAULT 0 |
| unit_price | NUMERIC(19,2) | NOT NULL |
| total | NUMERIC(19,2) | NOT NULL |
| cost_total | NUMERIC(19,2) | DEFAULT 0 |
| profit | NUMERIC(19,2) | DEFAULT 0 |
| payment_method | TEXT | NOT NULL |
| payment_type | TEXT | DEFAULT 'كاش' |
| paid_amount | NUMERIC(19,2) | DEFAULT 0 |
| remaining | NUMERIC(19,2) | DEFAULT 0 |
| status | TEXT | DEFAULT 'محجوز' |
| notes | TEXT | DEFAULT '' |
| ref_code | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| vin | TEXT | DEFAULT '' |
| recommended_price | NUMERIC(19,2) | DEFAULT 0 |
| down_payment_expected | NUMERIC(19,2) | DEFAULT 0 |
| payment_status | TEXT | DEFAULT 'pending' |

**Unique**: `ref_code` WHERE ref_code != ''
**Check**: `payment_status IN ('pending','partial','paid','cancelled')`

---

### 9. `payments`
> Client payment records

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| client_name | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| sale_id | INTEGER | DEFAULT NULL → FK sales.id (optional) |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| type | TEXT | DEFAULT 'collection' |
| payment_method | TEXT | DEFAULT 'كاش' |
| tva_amount | NUMERIC(19,2) | DEFAULT 0 |

**Check**: `type IN ('collection','refund','advance')`
**Check**: `payment_method IN ('كاش','بنك')`

---

### 10. `expenses`
> Business expenses

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| category | TEXT | NOT NULL |
| description | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| payment_type | TEXT | DEFAULT 'كاش' |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

---

### 11. `deliveries`
> Product delivery tracking

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| client_name | TEXT | NOT NULL |
| client_phone | TEXT | DEFAULT '' |
| address | TEXT | DEFAULT '' |
| items | TEXT | NOT NULL |
| total_amount | NUMERIC(19,2) | DEFAULT 0 |
| status | TEXT | DEFAULT 'قيد الانتظار' |
| driver_name | TEXT | DEFAULT '' |
| notes | TEXT | DEFAULT '' |
| ref_code | TEXT | DEFAULT '' |
| created_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |
| sale_id | INTEGER | DEFAULT NULL → FK sales.id ON DELETE SET NULL |
| assigned_driver | TEXT | DEFAULT '' |
| client_email | TEXT | DEFAULT '' |
| vin | TEXT | DEFAULT '' |

**Unique**: `ref_code` WHERE ref_code != ''

---

### 12. `invoices`
> Customer invoices

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| ref_code | TEXT | NOT NULL |
| date | TEXT | NOT NULL |
| sale_id | INTEGER | NOT NULL → FK sales.id ON DELETE CASCADE |
| delivery_id | INTEGER | NOT NULL → FK deliveries.id ON DELETE CASCADE |
| client_name | TEXT | NOT NULL |
| client_phone | TEXT | DEFAULT '' |
| client_email | TEXT | DEFAULT '' |
| client_address | TEXT | DEFAULT '' |
| item | TEXT | NOT NULL |
| quantity | NUMERIC(19,2) | NOT NULL |
| unit_price | NUMERIC(19,2) | NOT NULL |
| total | NUMERIC(19,2) | NOT NULL |
| payment_type | TEXT | DEFAULT 'كاش' |
| vin | TEXT | DEFAULT '' |
| seller_name | TEXT | DEFAULT '' |
| driver_name | TEXT | DEFAULT '' |
| status | TEXT | DEFAULT 'مؤكد' |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

**Unique**: `ref_code` WHERE ref_code != ''

---

### 13. `invoice_sequence`
> Atomic monthly invoice number generator

| Column | Type | Constraints |
|--------|------|-------------|
| year | INTEGER | PRIMARY KEY (composite) |
| month | INTEGER | PRIMARY KEY (composite) |
| last_number | INTEGER | DEFAULT 0 |

---

### 14. `bonuses`
> Seller and driver bonuses

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| username | TEXT | NOT NULL |
| role | TEXT | NOT NULL |
| sale_id | INTEGER | NULL → FK sales.id ON DELETE CASCADE |
| delivery_id | INTEGER | NOT NULL → FK deliveries.id ON DELETE CASCADE |
| item | TEXT | DEFAULT '' |
| quantity | NUMERIC(19,2) | DEFAULT 0 |
| recommended_price | NUMERIC(19,2) | DEFAULT 0 |
| actual_price | NUMERIC(19,2) | DEFAULT 0 |
| fixed_bonus | NUMERIC(19,2) | DEFAULT 0 |
| extra_bonus | NUMERIC(19,2) | DEFAULT 0 |
| total_bonus | NUMERIC(19,2) | DEFAULT 0 |
| settled | BOOLEAN | DEFAULT false |
| settlement_id | INTEGER | NULL |

**Unique**: `(delivery_id, role)`

---

### 15. `user_bonus_rates`
> Per-user bonus rate overrides

| Column | Type | Constraints |
|--------|------|-------------|
| username | TEXT | PRIMARY KEY → FK users.username ON DELETE CASCADE |
| seller_fixed | NUMERIC(19,2) | NULL |
| seller_percentage | NUMERIC(5,2) | NULL |
| driver_fixed | NUMERIC(19,2) | NULL |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

---

### 16. `settlements`
> Bonus and salary payouts

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| type | TEXT | NOT NULL |
| username | TEXT | NULL |
| description | TEXT | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| settled_by | TEXT | NOT NULL |
| notes | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

---

### 17. `price_history`
> Audit trail for product price changes

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| product_name | TEXT | NOT NULL |
| old_buy_price | NUMERIC(19,2) | DEFAULT 0 |
| new_buy_price | NUMERIC(19,2) | DEFAULT 0 |
| old_sell_price | NUMERIC(19,2) | DEFAULT 0 |
| new_sell_price | NUMERIC(19,2) | DEFAULT 0 |
| purchase_id | INTEGER | NULL |
| changed_by | TEXT | DEFAULT '' |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

---

### 18. `profit_distributions`
> Profit sharing distribution records

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| group_id | TEXT | NOT NULL |
| username | TEXT | NOT NULL |
| base_amount | NUMERIC(19,2) | NOT NULL |
| percentage | NUMERIC(5,2) | NOT NULL |
| amount | NUMERIC(19,2) | NOT NULL |
| base_period_start | TEXT | NULL |
| base_period_end | TEXT | NULL |
| notes | TEXT | DEFAULT '' |
| created_by | TEXT | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_by | TEXT | NULL |
| updated_at | TIMESTAMPTZ | NULL |

---

### 19. `cancellations`
> Audit trail for sale cancellations

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| sale_id | INTEGER | NOT NULL → FK sales.id |
| cancelled_by | TEXT | NOT NULL |
| cancelled_at | TIMESTAMPTZ | DEFAULT NOW() |
| reason | TEXT | NOT NULL |
| refund_amount | NUMERIC(19,2) | DEFAULT 0 |
| delivery_status_before | TEXT | NULL |
| bonus_status_before | TEXT | NULL |
| invoice_mode | TEXT | NOT NULL — CHECK: 'soft' or 'delete' |
| seller_bonus_kept | BOOLEAN | NULL |
| driver_bonus_kept | BOOLEAN | NULL |
| notes | TEXT | NULL |

---

### 20. `voice_logs`
> Voice input transcripts and action log

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| username | TEXT | NOT NULL |
| transcript | TEXT | DEFAULT '' |
| normalized_text | TEXT | DEFAULT '' |
| action_type | TEXT | DEFAULT '' |
| action_id | INTEGER | NULL |
| status | TEXT | DEFAULT 'pending' |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| debug_json | JSONB | NULL |

---

### 21. `ai_corrections`
> Machine learning from user edits

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| date | TEXT | NOT NULL |
| username | TEXT | NOT NULL |
| transcript | TEXT | NOT NULL |
| ai_output | TEXT | NOT NULL |
| user_correction | TEXT | NOT NULL |
| action_type | TEXT | NOT NULL |
| field_name | TEXT | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

---

### 22. `entity_aliases`
> Learned name mappings for voice recognition

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| entity_type | TEXT | NOT NULL — 'client', 'product', 'supplier' |
| entity_id | INTEGER | NOT NULL |
| alias | TEXT | NOT NULL |
| normalized_alias | TEXT | NOT NULL |
| source | TEXT | DEFAULT 'user' |
| frequency | INTEGER | DEFAULT 1 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Unique**: `(entity_type, normalized_alias)`

---

### 23. `ai_patterns`
> Common voice patterns for recognition

| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| pattern_type | TEXT | NOT NULL |
| spoken_text | TEXT | NOT NULL |
| correct_value | TEXT | NOT NULL |
| field_name | TEXT | NOT NULL |
| frequency | INTEGER | DEFAULT 1 |
| last_used | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| username | TEXT | DEFAULT '' |

**Unique**: `(spoken_text, correct_value, field_name, username)`

---

## Relationships & Foreign Keys

### Entity-Relationship Diagram (Text)

```
                           ┌──────────────┐
                           │    users     │
                           │  (username)  │
                           └──────┬───────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │ PK/FK       │ TEXT ref      │ TEXT ref
                    ▼             ▼               ▼
          ┌─────────────────┐ ┌────────┐  ┌──────────────┐
          │ user_bonus_rates│ │bonuses │  │ settlements  │
          └─────────────────┘ └───┬────┘  └──────────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │ FK          │ FK            │
                    ▼             ▼               │
              ┌──────────┐  ┌────────────┐       │
              │  sales   │  │ deliveries │       │
              └────┬─────┘  └─────┬──────┘       │
                   │              │               │
          ┌────────┼────────┐     │               │
          │ FK     │ FK     │ FK  │               │
          ▼        ▼        ▼     ▼               │
    ┌─────────┐ ┌─────────┐ ┌──────────┐         │
    │payments │ │invoices │ │ bonuses  │         │
    └─────────┘ └─────────┘ └──────────┘         │
                                                  │
              ┌──────────┐                        │
              │purchases │                        │
              └────┬─────┘                        │
                   │ FK                           │
                   ▼                              │
          ┌──────────────────┐                    │
          │supplier_payments │                    │
          └──────────────────┘                    │

   ┌───────────┐        ┌───────────┐
   │ products  │◄·······│price_hist │  (TEXT ref by name)
   └───────────┘        └───────────┘

   ┌───────────┐        ┌───────────┐
   │ suppliers │◄·······│ purchases │  (TEXT ref by name)
   └───────────┘        └───────────┘

   ┌───────────┐        ┌───────────┐
   │  clients  │◄·······│   sales   │  (TEXT ref by name)
   └───────────┘        └───────────┘

   ┌───────────┐  ┌───────────────┐  ┌─────────────┐
   │cancellat. │  │profit_distrib.│  │invoice_seq  │
   │→ sales.id │  │(by group_id)  │  │(year,month) │
   └───────────┘  └───────────────┘  └─────────────┘

   ┌────────────┐  ┌───────────────┐  ┌─────────────┐
   │ voice_logs │  │ai_corrections │  │ ai_patterns │
   └────────────┘  └───────────────┘  └─────────────┘

   ┌────────────┐  ┌───────────┐
   │entity_alias│  │ settings  │
   └────────────┘  └───────────┘
```

### Direct Foreign Keys

| From | Column | → To | Column | ON DELETE |
|------|--------|------|--------|-----------|
| user_bonus_rates | username | users | username | CASCADE |
| deliveries | sale_id | sales | id | SET NULL |
| bonuses | sale_id | sales | id | CASCADE |
| bonuses | delivery_id | deliveries | id | CASCADE |
| invoices | sale_id | sales | id | CASCADE |
| invoices | delivery_id | deliveries | id | CASCADE |
| supplier_payments | purchase_id | purchases | id | — |
| payments | sale_id | sales | id | (optional) |
| cancellations | sale_id | sales | id | — |

### Text-Based References (no FK constraint)

| From | Column | → To | Column |
|------|--------|------|--------|
| purchases | supplier | suppliers | name |
| sales | client_name | clients | name |
| payments | client_name | clients | name |
| deliveries | client_name | clients | name |
| deliveries | assigned_driver | users | username |
| bonuses | username | users | username |
| settlements | username | users | username |
| profit_distributions | username | users | username |
| price_history | product_name | products | name |

---

## User Roles & Permissions

### Role Hierarchy

```
ADMIN ─── full control over everything
  │
MANAGER ── operational oversight, no settlements/user-mgmt
  │
SELLER ─── sales + clients + own bonuses (no cost data)
  │
DRIVER ─── deliveries + own bonuses only
```

### Permission Matrix

| Feature | Admin | Manager | Seller | Driver |
|---------|:-----:|:-------:|:------:|:------:|
| Dashboard (summary) | R | R | R | — |
| Purchases | CRUD | CRUD | — | — |
| Sales | CRUD | CRUD | CR (own) | — |
| Edit confirmed sales | Yes | — | — | — |
| Cancel sales | Any | Reserved only | Own reserved | — |
| Expenses | CRUD | CRUD | — | — |
| Deliveries | CRUD | CRUD | R | Update own |
| Invoices | CRUD + void | R | R (own) | R (own) |
| Stock / Products | CRUD | CRUD | R (no cost) | — |
| Clients | CRUD | CRUD | CR | — |
| Suppliers | CRUD | CRUD | — | — |
| Payments (client) | CRUD | CRUD | — | — |
| Bonuses | R (all) | R (all) | R (own) | R (own) |
| Settlements | CRUD | — | — | — |
| Profit distributions | CRUD | R | — | — |
| Users | CRUD | — | — | — |
| Settings | RW | — | — | — |

**R** = Read, **C** = Create, **U** = Update, **D** = Delete

### Default Landing Pages
- Admin / Manager → `/summary`
- Seller → `/sales`
- Driver → `/deliveries`

---

## Business Workflow

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BUSINESS WORKFLOW                            │
│                                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│   │ PURCHASE │───▶│  STOCK   │───▶│   SALE   │───▶│ DELIVERY │    │
│   │          │    │ (auto-   │    │          │    │          │    │
│   │ Admin/   │    │  update) │    │ Seller/  │    │ Driver   │    │
│   │ Manager  │    │          │    │ Admin/   │    │ confirms │    │
│   └──────────┘    └──────────┘    │ Manager  │    └────┬─────┘    │
│        │                          └────┬─────┘         │          │
│        │                               │               │          │
│        ▼                               ▼               ▼          │
│   ┌──────────┐                   ┌──────────┐    ┌──────────┐    │
│   │ SUPPLIER │                   │ PAYMENT  │    │ INVOICE  │    │
│   │ PAYMENT  │                   │ (client  │    │ (auto-   │    │
│   │ (partial)│                   │  pays)   │    │  gen)    │    │
│   └──────────┘                   └──────────┘    └──────────┘    │
│                                                       │          │
│                                                       ▼          │
│                                                  ┌──────────┐    │
│                                                  │  BONUS   │    │
│                                                  │ (seller  │    │
│                                                  │ + driver)│    │
│                                                  └────┬─────┘    │
│                                                       │          │
│                                                       ▼          │
│                                                  ┌──────────┐    │
│                                                  │SETTLEMENT│    │
│                                                  │ (admin   │    │
│                                                  │  pays    │    │
│                                                  │  staff)  │    │
│                                                  └──────────┘    │
│                                                                   │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ CANCELLATION (admin only) — reverses sale + delivery     │    │
│   │ + invoice + bonus with full audit trail                  │    │
│   └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │ PROFIT DISTRIBUTION (admin) — distributes profit shares  │    │
│   │ to managers/admins based on configured percentages       │    │
│   └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Workflow

#### Step 1: Purchase (Admin/Manager)
1. Admin/Manager creates a purchase from a supplier
2. System auto-generates ref_code: `PU-YYYYMMDD-NNNNXX`
3. Product stock is **increased** by purchase quantity
4. Product buy_price updated via **weighted average**:
   ```
   newBuy = (oldStock × oldBuy + newQty × newPrice) / (oldStock + newQty)
   ```
5. Price change recorded in `price_history`
6. Supplier payment can be full or partial → tracked in `supplier_payments`

#### Step 2: Stock (Automatic)
- Stock levels update automatically on purchase (increase) and delivery (decrease)
- Sellers see available stock (no cost data)
- Admin/Manager see full details + low-stock alerts (threshold per product)

#### Step 3: Sale (Seller/Admin/Manager)
1. Seller creates a sale order for a client
2. System auto-generates ref_code: `SL-YYYYMMDD-NNNNXX`
3. Client auto-created if not existing
4. **Price validation**:
   - Sellers cannot sell below `sell_price` (recommended price)
   - Nobody can sell below `buy_price` (absolute floor)
5. Sale status flow:
   ```
   محجوز (reserved) ──▶ مؤكد (confirmed)
          │
          └──▶ ملغى (cancelled)
   ```
6. Payment status flow:
   ```
   pending ──▶ partial ──▶ paid
      │
      └──▶ cancelled
   ```

#### Step 4: Delivery (Driver)
1. Admin/Manager assigns a driver to the delivery
2. System auto-generates ref_code: `DL-YYYYMMDD-NNNNXX`
3. Driver updates status when delivering
4. VIN required for e-bikes/scooters
5. Delivery status flow:
   ```
   قيد الانتظار (pending) ──▶ قيد التنفيذ (in-progress) ──▶ تم التوصيل (delivered)
                                        │
                                        └──▶ ملغى (cancelled)
   ```
6. Stock was already reserved at sale creation (no change at delivery confirmation)

#### Step 5: Invoice (Auto-generated)
1. Invoice created automatically on delivery completion
2. Ref code format: `INV-YYYYMM-NNN` (monthly sequence)
3. Atomic numbering via `invoice_sequence` table
4. Includes: client info, product, quantity, price, VIN, seller, driver

#### Step 6: Bonus Calculation (Automatic)
1. Triggered on delivery confirmation
2. Bonus formula:
   - **Fixed bonus**: from `user_bonus_rates` or global `settings`
   - **Extra bonus**: `(actual_price - recommended_price) × percentage / 100`
   - **Total**: fixed + extra
3. One bonus row per delivery per role (seller + driver)
4. Per-user rate overrides in `user_bonus_rates` fall back to global settings

#### Step 7: Settlement (Admin)
1. Admin processes bonus/salary payments to staff
2. Marks related bonuses as `settled = true`
3. Records settlement with full audit trail

#### Cancellation Flow (Admin only)
1. Admin cancels sale with mandatory reason
2. System records in `cancellations` table:
   - Previous delivery and bonus states
   - Invoice handling mode (soft archive or delete)
   - Refund amount
3. Related records updated: sale status → cancelled, delivery → cancelled, bonuses optionally reversed

#### Profit Distribution (Admin)
1. Admin creates distribution for a date range
2. Multiple recipients per group (each with percentage share)
3. Percentages must sum to 100%
4. Tracked per period with unique constraint

---

## Indexes & Constraints

### Unique Indexes

| Table | Columns | Condition |
|-------|---------|-----------|
| users | username | — |
| products | name | — |
| purchases | ref_code | WHERE ref_code != '' |
| sales | ref_code | WHERE ref_code != '' |
| deliveries | ref_code | WHERE ref_code != '' |
| invoices | ref_code | WHERE ref_code != '' |
| clients | (name, phone) | WHERE phone != '' |
| clients | (name, email) | WHERE email != '' |
| suppliers | (name, phone) | WHERE phone != '' |
| bonuses | (delivery_id, role) | — |
| entity_aliases | (entity_type, normalized_alias) | — |
| ai_patterns | (spoken_text, correct_value, field_name, username) | — |

### Performance Indexes

| Table | Index | Columns |
|-------|-------|---------|
| sales | sales_payment_status_idx | payment_status |
| supplier_payments | supplier_payments_purchase_id_idx | purchase_id |
| profit_distributions | profit_distributions_group_idx | group_id |
| profit_distributions | profit_distributions_username_idx | username |
| profit_distributions | profit_distributions_created_idx | created_at DESC |
| cancellations | cancellations_sale_id_idx | sale_id |

### Check Constraints

| Table | Constraint | Allowed Values |
|-------|-----------|----------------|
| sales | payment_status | 'pending', 'partial', 'paid', 'cancelled' |
| payments | type | 'collection', 'refund', 'advance' |
| payments | payment_method | 'كاش', 'بنك' |
| cancellations | invoice_mode | 'soft', 'delete' |

---

## Default Settings & Seed Data

### Shop Configuration (settings table)

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
| shop_website | www.vitesse-eco.fr |
| vat_rate | 20 |
| invoice_currency | EUR |
| seller_bonus_fixed | 10 |
| seller_bonus_percentage | 50 |
| driver_bonus_fixed | 5 |

### Default Admin User

| Field | Value |
|-------|-------|
| username | admin |
| name | المدير العام |
| role | admin |

### Voice Recognition - Seed Product Aliases

Pre-configured Arabic aliases for products:
- V20 Mini, V20 Pro, V20 Limited, S20 Pro, V20 Cross
- Q30 Pliable, D50, C28, EB30, V20 Max
- Includes Arabic nicknames and descriptors

---

## API Routes Summary

| Route | Methods | Primary Tables | Allowed Roles |
|-------|---------|---------------|---------------|
| /api/purchases | GET, POST, PUT | purchases, products, supplier_payments, price_history | admin, manager |
| /api/purchases/[id]/pay | POST | purchases, supplier_payments | admin, manager |
| /api/sales | GET, POST, PUT | sales, products, bonuses, deliveries, invoices | admin, manager, seller |
| /api/sales/[id]/cancel | POST | sales, bonuses, deliveries, invoices, cancellations | admin |
| /api/sales/[id]/collect | POST | sales, payments | admin, manager, seller |
| /api/deliveries | GET, POST, PUT | deliveries, sales, bonuses, invoices | all roles |
| /api/expenses | GET, POST, DELETE | expenses | admin, manager |
| /api/clients | GET, POST | clients, sales, payments | admin, manager, seller |
| /api/clients/[id]/collect | POST | clients, sales, payments | admin, manager, seller |
| /api/products | GET, POST, DELETE | products, price_history | admin, manager |
| /api/suppliers | GET, POST, DELETE | suppliers, purchases | admin, manager (DELETE ممنوع إذا له مشتريات — BR-33) |
| /api/payments | GET, POST | payments, sales | admin, manager |
| /api/bonuses | GET | bonuses, users | all roles |
| /api/settlements | GET, POST | settlements, bonuses, users | admin |
| /api/invoices | GET, PUT | invoices, sales, deliveries | all roles |
| /api/profit-distributions | GET, POST | profit_distributions, users, sales, payments | admin, manager |
| /api/users | GET, POST, PUT | users, user_bonus_rates | admin (لا DELETE — تعطيل فقط BR-37) |
| /api/settings | GET, PUT | settings | admin |
| /api/summary | GET | sales, purchases, payments, expenses, deliveries, clients, suppliers | admin, manager |

---

> **Note**: This document is read-only documentation. No database changes were made.
> Generated: 2026-04-18
