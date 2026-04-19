# سجل التدقيق — Audit Log

> **رقم العنصر**: #27 | **المحور**: هـ | **الحالة**: مواصفات نهائية

---

## الاستراتيجية

كل تعديل على الحالة المالية أو البيانات الحيوية يُسجَّل في **جدول `activity_log`** داخل نفس المعاملة التي أحدثت التغيير. هذا يضمن أن أي تغيير مرئي في الجداول الأساسية يكون له صف مقابل في السجل.

إضافة إلى ذلك، جداول متخصصة تحفظ تدقيقات domain-specific.

---

## طبقات التدقيق

| # | الآلية | الجدول | ما يُسجَّل | الإضافة |
|---|--------|--------|-----------|--------|
| 1 | **سجل النشاطات** | `activity_log` | كل mutation مع `old_value` و `new_value` (JSONB) | داخل نفس الـ transaction |
| 2 | **سجل الإلغاءات** | `cancellations` | 3 خيارات C1 + الحالات السابقة + سبب + مبلغ الاسترداد | |
| 3 | **سجل الأسعار** | `price_history` | old/new buy_price و sell_price + `changed_by` | عند كل شراء أو تعديل |
| 4 | **دفعات الموردين** | `supplier_payments` | كل دفعة بالتاريخ والمبلغ وطريقة الدفع | |
| 5 | **حركات الصندوق** | `treasury_movements` | كل حركة مالية مع المرجع (reference_type + reference_id) | |
| 6 | **مبالغ payments موقَّعة** | `payments.amount` | collection موجب، refund سالب (D-06) — TVA ليست مخزَّنة (D-02) | |
| 7 | **سجل الصوت** | `voice_logs` | transcript + debug_json الكامل | retention 30 يوم |
| 8 | **أعمدة التدقيق** | كل الجداول | `created_by`, `updated_by`, `updated_at`, `deleted_by`, `deleted_at` | |
| 9 | **مفاتيح Idempotency** | `idempotency_keys` | (D-16) — key + request_hash + response + status_code | TTL 24h |

---

## `activity_log` schema

```
id              SERIAL PK
timestamp       TIMESTAMPTZ DEFAULT NOW()
user_id         INTEGER NULL
username        TEXT NOT NULL
action          TEXT NOT NULL (create|update|delete|cancel|confirm|collect|login|logout)
entity_type     TEXT NOT NULL (order|order_item|delivery|invoice|payment|treasury_movement|...)
entity_id       INTEGER NULL
entity_ref_code TEXT NULL
details         JSONB NULL       -- { old: {...}, new: {...}, reason?: '...' }
ip_address      TEXT NULL
prev_hash       TEXT NULL        -- D-37 hash chain
row_hash        TEXT NOT NULL    -- SHA256(prev_hash || canonical(row_data))
```

### Hash Chain (D-37)

كل row في `activity_log` يحمل `row_hash = SHA256(prev_hash || canonical_json(row_data))`. الـ trigger يحسب قبل INSERT. كشف التلاعب:
```sql
-- verify chain
SELECT id FROM activity_log a1
WHERE row_hash != encode(sha256(convert_to(COALESCE(prev_hash,'') ||
   json_build_object(/* ... canonical fields ... */)::text, 'UTF8')), 'hex');
```
نفس النهج على `invoices`, `invoice_lines`, `cancellations` (D-37).

### Immutability Triggers (D-58)

```sql
CREATE TRIGGER activity_log_no_update BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER cancellations_no_update BEFORE UPDATE ON cancellations
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER price_history_no_update BEFORE UPDATE ON price_history
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER treasury_movements_no_update BEFORE UPDATE ON treasury_movements
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER invoices_no_update BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER invoice_lines_no_update BEFORE UPDATE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
```
Migration: `src/db/migrations/0001_immutable_audits.sql`.

---

## صلاحيات العرض

| الدور | ما يرى |
|-------|--------|
| `pm` | كل شيء، بلا قيود |
| `gm` | كل شيء |
| `manager` | فقط نشاطات فريقه (sellers/drivers/stock_keepers تحت إدارته) |
| `seller / driver / stock_keeper` | لا يرى سجل التدقيق |

---

## صفحة `/activity`

- **Filters**: entity_type، action، date range، user.
- **Pagination**: 50 صف/صفحة.
- **Export**: CSV بفاصلة منقوطة (قرار M13).
- **Details**: النقر على صف يفتح modal يعرض `old_value` vs `new_value` بجانب بعض (diff view).

---

## Retention

- `activity_log` يُحتفظ به لمدة `settings.activity_log_retention_days` = 90 يوم (قابل للتعديل).
- Cron job يومي عند 03:00 Europe/Paris يحذف السجلات الأقدم من العتبة.
- قبل الحذف، تصدير اختياري للـ CSV أرشيفي (إذا تطلَّب الأمر).

---

## قواعد التدقيق الملزِمة

1. **لا mutation بلا activity_log**: أي `INSERT/UPDATE/DELETE` على جدول أساسي يجب أن يصاحبه صف في `activity_log` داخل نفس الـ `withTx()`.
2. **soft-delete يظهر كـ update** (`action='delete'`، details تحتوي على السبب).
3. **إعادة تسمية الكيان** (D-20): يُسجَّل `action='update'` على الكيان الأصلي فقط (`clients/suppliers/products/users`). الأعمدة `*_name_cached` في السجلات التابعة **لا تُحدَّث** (قرار D-20 يُلغي H4/BR-49 القديم). الاسم الحالي يُستنتَج عبر JOIN على `*_id`.
4. **IP address** يُلتقط من `request.headers.get('x-forwarded-for')` أو `request.ip`.
5. **لا يُسمح بتعديل صفوف `activity_log`** — أي محاولة تُرجع 403 حتى لـ PM.
