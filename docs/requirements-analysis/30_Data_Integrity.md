# سلامة البيانات — Data Integrity

> **رقم العنصر**: #30 | **المحور**: و | **الحالة**: مواصفات نهائية

---

## سياسة الحذف الناعم (D-04 مطلق)

**الحذف الفعلي (DELETE SQL) ممنوع نهائياً** على الجداول المالية والحركية، حتى لـ PM (D-04).

| الكيان | DELETE fuel endpoint؟ | البديل |
|--------|:-----:|--------|
| `orders` | ❌ لا endpoint | `UPDATE orders SET status='ملغي', deleted_at=NOW()` |
| `order_items` | ❌ | soft-delete كأب |
| `deliveries` | ❌ | `status='ملغي'` |
| `invoices` | ❌ | `status='ملغي'` (BR-65) |
| `payments` | ❌ | soft-delete فقط |
| `bonuses` | ❌ | soft-delete أو `status` change |
| `settlements` | ❌ | soft-delete |
| `treasury_movements` | ❌ | soft-delete (reconciliation للتصحيح) |
| `profit_distributions` | ❌ | soft-delete |
| `cancellations` | ❌ | immutable audit |
| `purchases` | ❌ (كان ✅ قديماً) | soft-delete + `/api/purchases/:id/reverse` لعكس الأثر |
| `expenses` | ❌ | soft-delete |
| `supplier_payments` | ❌ | soft-delete + reconciliation movement |
| `products` | ❌ | `active = false` (BR-06/H6) |
| `users` | ❌ | `active = false` (BR-43) |
| `suppliers` | ❌ | `active = false` |
| `clients` | ❌ إذا له orders | إلا pseudonymization للـ GDPR — راجع 17 |

### طبقة دفاع إضافية

```sql
REVOKE DELETE ON orders, order_items, deliveries, invoices, payments,
                  bonuses, settlements, treasury_movements,
                  profit_distributions, cancellations, purchases,
                  supplier_payments, expenses
  FROM app_role;
```

حتى لو الكود أخطأ، DB ترفض DELETE. الاستثناء الوحيد: جداول التشغيلي (`activity_log`, `voice_logs`, `notifications`, `idempotency_keys`) لها DELETE permission للـ cron.

---

## Soft-delete columns

```sql
deleted_at     TIMESTAMPTZ NULL
deleted_by     TEXT NULL
deleted_reason TEXT NULL
```

موجودة على كل الجداول المالية/الحركية. الاستعلامات الافتراضية تفلتر `WHERE deleted_at IS NULL` أو تستخدم `active_*` views.

### Partial UNIQUE indexes

كل UNIQUE constraint يتضمن `WHERE deleted_at IS NULL` لإعادة استخدام الأسماء/الـ ref_codes بعد soft-delete:

```sql
CREATE UNIQUE INDEX orders_ref_code_unique
  ON orders(ref_code)
  WHERE ref_code != '' AND deleted_at IS NULL;

CREATE UNIQUE INDEX products_name_unique
  ON products(name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX clients_name_phone_unique
  ON clients(name, phone)
  WHERE phone != '' AND deleted_at IS NULL;
-- ...وهكذا
```

---

## Foreign Keys — ON DELETE policy

- **RESTRICT على كل FK** (D-27 — Phase 0c): الحذف ناعم عبر `deleted_at`، و CASCADE لا يُطلَق على UPDATE. لذلك CASCADE كان فخّاً زائفاً + يعرِّض البيانات لـ DELETE عرضي من psql console.
- الـ cascade المنطقي (soft-delete الأب → soft-delete الأبناء) يُحاكى **يدوياً داخل `withTx`** ذرياً:
  - `order_items` ↔ `orders`.
  - `product_images` ↔ `products`.
  - `notifications` / `notification_preferences` ↔ `users`.
  - `profit_distributions` ↔ `profit_distribution_groups`.
  - `user_bonus_rates` ↔ `users`.

لا DELETE حقيقياً على جداول مالية حرجة (bonuses, invoices, payments، treasury_movements) — soft-delete فقط، و FK = RESTRICT يضمن فشل أي DELETE عرضي.

---

## FK IDs vs denormalized names (D-20)

**القاعدة القديمة H4/BR-49** (تحديث ذري للأسماء عبر 6+ جداول) **أُلغيت**:

- كل جدول حركي يحمل `*_id FK` كمصدر truth + `*_name_cached` للعرض التاريخي.
- عند تغيير اسم الكيان الأصلي (مثل `clients.name`): **لا يُحدَّث** الـ cached name في السجلات التاريخية. السجل التاريخي يعرض الاسم وقت الإنشاء (محاسبياً صحيح).
- Dashboards الحية تقرأ الاسم الحالي عبر JOIN على `*_id`.
- البحث يعمل على الاسم الحالي مع fallback على cached إذا الكيان معطَّل.

راجع `02_DB_Tree.md` لقائمة الأعمدة الكاملة.
