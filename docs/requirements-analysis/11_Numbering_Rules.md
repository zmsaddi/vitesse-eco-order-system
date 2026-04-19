# قواعد الترقيم — Numbering Rules

> **رقم العنصر**: #11 | **المحور**: ب | **الحالة**: مواصفات نهائية

---

## الأنماط

| الكيان | البادئة | الصيغة | مثال |
|--------|---------|--------|------|
| الطلبات | `ORD` | `ORD-YYYYMMDD-NNNNN` | `ORD-20260418-00001` |
| المشتريات | `PU` | `PU-YYYYMMDD-NNNNN` | `PU-20260418-00001` |
| التوصيلات | `DL` | `DL-YYYYMMDD-NNNNN` | `DL-20260418-00001` |
| الفواتير | `FAC` | `FAC-YYYY-MM-NNNN` | `FAC-2026-04-0001` |

### ملاحظات
- **الطلبات/المشتريات/التوصيلات**: 5 أرقام يومية — تدعم حتى 99,999/يوم (كافٍ).
- **الفواتير**: 4 أرقام شهرية — تدعم حتى 9,999/شهر. الترقيم **شهري** للتوافق مع التقارير المحاسبية الفرنسية.
- **التنسيق الفرنسي** للفواتير يستخدم `-` بين السنة والشهر (وليس `202604`).

---

## الترقيم الذري

### الطلبات/المشتريات/التوصيلات

```ts
// خلال withTx:
const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
const prefix = 'ORD';
const sql = `
  SELECT COALESCE(MAX(CAST(SPLIT_PART(ref_code, '-', 3) AS INTEGER)), 0) + 1 AS next
  FROM orders WHERE ref_code LIKE ${prefix || '-' || today || '-%'}
`;
const { next } = await client.execute(sql);
const refCode = `${prefix}-${today}-${String(next).padStart(5, '0')}`;
```

### الفواتير

جدول `invoice_sequence` يحفظ counter شهري:

```sql
CREATE TABLE invoice_sequence (
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  last_number INTEGER DEFAULT 0,
  PRIMARY KEY (year, month)
);
```

```ts
// خلال withTx:
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;

await client.execute(`
  INSERT INTO invoice_sequence (year, month, last_number)
  VALUES ($1, $2, 1)
  ON CONFLICT (year, month)
  DO UPDATE SET last_number = invoice_sequence.last_number + 1
  RETURNING last_number
`, [year, month]);

const refCode = `FAC-${year}-${String(month).padStart(2, '0')}-${String(lastNumber).padStart(4, '0')}`;
```

**الذرية** مضمونة بـ `ON CONFLICT ... DO UPDATE ... RETURNING` — سطر واحد atomic.

---

## قيود على DB

```sql
-- UNIQUE عندما ref_code غير فارغ (يسمح بـ '' للـ drafts إن لزم)
CREATE UNIQUE INDEX orders_ref_code_unique    ON orders(ref_code)    WHERE ref_code != '';
CREATE UNIQUE INDEX deliveries_ref_code_unique ON deliveries(ref_code) WHERE ref_code != '';
CREATE UNIQUE INDEX invoices_ref_code_unique  ON invoices(ref_code)  WHERE ref_code != '';
CREATE UNIQUE INDEX purchases_ref_code_unique ON purchases(ref_code) WHERE ref_code != '';
```

---

## المنطقة الزمنية

جميع التواريخ في الـ ref_code تُحسب بـ **Europe/Paris** (قرار L3):

```ts
const parisDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date());
```

هذا يمنع حالات "الفاتورة رقم 00001 في اليوم الخطأ" إذا كانت function تعمل في UTC.

---

## تدوير سنوي للفواتير

- كل سنة جديدة، `invoice_sequence` يبدأ من 1 تلقائياً (لأن المفتاح هو `year+month`).
- لا إجراء يدوي مطلوب.
- `FAC-2027-01-0001` يبدأ بعد `FAC-2026-12-9999` طبيعياً.
