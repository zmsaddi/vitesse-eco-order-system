# قواعد الترقيم وتوليد الأكواد — Numbering & Code Generation Rules

> **رقم العنصر**: #10 | **المحور**: ب | **الحالة**: مكتمل

---

## الأنماط

### 1. كود المشتريات: `PU-YYYYMMDD-TTTTTTSSS`
- **البادئة**: PU
- **التاريخ**: YYYYMMDD (تاريخ الإنشاء)
- **اللاحقة**: آخر 6 أرقام من timestamp بالمللي ثانية + 3 أحرف عشوائية (A-Z, 0-9)
- **مثال**: `PU-20260418-452123ABC`
- **التفرد**: UNIQUE INDEX حيث ref_code ≠ ''

### 2. كود المبيعات: `SL-YYYYMMDD-TTTTTTSSS`
- **نفس النمط** مع بادئة SL
- **مثال**: `SL-20260418-781456XYZ`

### 3. كود التوصيل: `DL-YYYYMMDD-TTTTTTSSS`
- **نفس النمط** مع بادئة DL
- **مثال**: `DL-20260418-312789DEF`

### 4. كود الفاتورة: `INV-YYYYMM-NNN`
- **البادئة**: INV
- **التاريخ**: YYYYMM (سنة + شهر)
- **التسلسل**: رقم تسلسلي شهري يبدأ من 001
- **مثال**: `INV-202604-001`, `INV-202604-002`, ... `INV-202605-001` (يعاد الترقيم كل شهر)
- **التوليد**: INSERT ON CONFLICT ذري عبر جدول `invoice_sequence`
- **التفرد**: UNIQUE INDEX حيث ref_code ≠ ''

### 5. معرّف مجموعة توزيع الأرباح: `PD-{base36timestamp}-{random}`
- **البادئة**: PD
- **الجسم**: timestamp بالمللي ثانية (base36) + 8 أحرف عشوائية (base36)
- **مثال**: `PD-intvqd-ab2c3d4e`
- **الغرض**: جميع صفوف المستلمين في توزيع واحد تشترك في نفس group_id

---

## آلية التوليد

### PU/SL/DL (generateRefCode)
```javascript
const date = now.toISOString().slice(0, 10).replace(/-/g, '');
const ts = String(Date.now()).slice(-6);
const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
return `${prefix}-${date}-${ts}${rand}`;
```

### INV (getNextInvoiceNumber — ذري)
```sql
INSERT INTO invoice_sequence (year, month, last_number)
VALUES ($year, $month, 1)
ON CONFLICT (year, month)
DO UPDATE SET last_number = invoice_sequence.last_number + 1
RETURNING last_number;
```
- آمن تحت الاستدعاءات المتزامنة (عبارة SQL واحدة)
- لا يحتاج معاملة خارجية

---

## ضمان التفرد

| الجدول | الفهرس | النوع |
|--------|--------|-------|
| purchases | `purchases_ref_code_unique` | UNIQUE جزئي (WHERE ref_code ≠ '') |
| sales | `sales_ref_code_unique` | UNIQUE جزئي |
| deliveries | `deliveries_ref_code_unique` | UNIQUE جزئي |
| invoices | `invoices_ref_code_unique` | UNIQUE جزئي |
