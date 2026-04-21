# القواعد المحاسبية — Accounting Rules

> **رقم العنصر**: #12 | **المحور**: ب | **الحالة**: مواصفات نهائية

---

## المبدأ الأساسي

**كل الأرقام TTC** — TVA لا تُخزَّن في أي جدول حركي (D-02 + H1).
**استثناء (D-30)**: عند **إصدار** الفاتورة، TVA تُجمَّد في `invoices.tva_amount_frozen` + `invoice_lines.vat_amount_frozen` لضمان inaltérabilité (loi anti-fraude TVA 2018).

## النظام **ليس** نظام محاسبة رسمي (D-36 — FEC Delegation)

**هذا النظام هو نظام إدارة عمليات + caisse + facturation — وليس نظام tenue de comptabilité بمفهوم PCG 2014.**

- المشروع **لا يُنتج** Journal comptable رسمياً.
- المشروع **لا يُنتج** FEC (Fichier des Écritures Comptables) بنفسه.
- المحاسبة الخارجية (**expert-comptable**) تتولى ذلك وفق خطاب تعهُّد موقَّع في `docs/compliance/fec_delegation.md` (D-36).

### ماذا يُصدِّر النظام شهرياً للـ expert-comptable:
1. **PDF الفواتير** (تُرسَل تلقائياً أو تُنزَّل): كل الفواتير + Avoirs.
2. **CSV الدفعات** (`payments.csv`): date, amount signed, payment_method, order_ref, client.
3. **CSV حركات الصندوق** (`treasury_movements.csv`).
4. **CSV المصاريف** (`expenses.csv`) مع عمود `comptable_class` (D-61 — PCG class).
5. **CSV المشتريات** (`purchases.csv`).
6. **CSV الإلغاءات** (`cancellations.csv`).

### ما تُنفِّذه الـ expert-comptable:
1. إدخال/import الـ CSV + PDF في برنامج محاسبي احترافي (Sage, Cegid, ACD — certified NF525).
2. إنشاء Journal comptable + Grand-livre بأرقام حسابات PCG (411 Clients, 530 Caisse, 512 Banque, 401 Fournisseurs, 607 Achats, 706 Prestations, 445 TVA...).
3. إنتاج FEC عند طلب DGFiP.
4. إنتاج déclaration TVA (CA3) شهرياً/ربعياً.
5. حفظ الأرشفة 10 سنوات (C. com L123-22).

**المرجع القانوني**: CGI art. L47 A-I + décret 2013-346 + LPF art. A47 A-1 + PCG 2014.

---

## التعامل مع TVA

- المشروع **لا يحسب** إعلانات TVA الشهرية داخلياً. المحاسبة الخارجية (expert-comptable) تتولى ذلك من الفواتير PDF (pièces justificatives).
- المشروع يُخزِّن **TTC فقط** في كل الجداول المالية (`payments.amount`, `orders.total_amount`, `order_items.line_total`, `invoices.total`، إلخ).
- عند render الفاتورة PDF، TVA تُحسب:

```
vatRate    = settings.vat_rate    // افتراضي "20"
totalTTC   = order.total_amount
vatAmount  = round2(totalTTC × vatRate / (100 + vatRate))
totalHT    = round2(totalTTC - vatAmount)
```

Helper: `tvaFromTtc(ttc, rate)` و `htFromTtc(ttc, rate)` في `src/lib/tva.ts`.

- الفاتورة PDF تُعرض: السعر HT + معدل TVA% + مبلغ TVA + المجموع TTC (متطلب قانوني فرنسي).
- `payments.amount` موقَّع (collection موجب، refund سالب، advance موجب) — يُغذّي P&L وتوزيع الأرباح (D-06).

---

## نظام الصناديق الهرمي (Treasury System)

### الهيكل

```
المستوى 1: صندوق المدير العام (GM)
  ├── كاش (main_cash)
  ├── بنك (main_bank)
  ├── يموّل صناديق المدراء
  ├── يستقبل التسويات من المدراء
  └── يدفع: موردين، توزيع أرباح، مصاريف كبرى

المستوى 2: صندوق المدير (Manager)
  ├── manager_box
  ├── يستقبل تمويل من GM
  ├── يستقبل تسليم أموال من السائقين
  ├── يدفع: مصاريف يومية، مشتريات صغيرة
  └── يسوّي مع GM (يسلّم الفائض)

المستوى 3: عهدة السائق (Driver)
  ├── driver_custody
  ├── يحصّل من عملاء (كاش)
  ├── يسلّم لمديره
  └── رصيده = ما حصّله - ما سلّمه
```

### أنواع الحركات (treasury_movements categories)

| الفئة | الوصف | الاتجاه |
|-------|-------|---------|
| sale_collection | تحصيل من عميل | inflow |
| supplier_payment | دفع لمورد | outflow |
| expense | مصروف | outflow |
| settlement | تسوية عمولة | outflow |
| reward | مكافأة | outflow |
| profit_distribution | توزيع أرباح | outflow |
| driver_handover | سائق يسلّم لمدير | transfer |
| manager_settlement | مدير يسوّي مع GM | transfer |
| funding | تمويل من GM لمدير | transfer |
| bank_deposit | إيداع كاش في بنك | transfer |
| bank_withdrawal | سحب من بنك | transfer |
| refund | استرداد عند إلغاء (موقَّع سالب في payments) | inflow (سالب — يُنقِص الرصيد) |
| reconciliation | تسجيل فرق في التسوية اليومية | inflow/outflow حسب الإشارة |

**ملاحظة**: `supplier_credit` **محذوف** من treasury_movements (D-10). الرصيد الدائن للمورد يُدار في `suppliers.credit_due_from_supplier`، خارج treasury — لأنه receivable ليس cash.

### Avoir (D-38 + Phase 4.5 — bookkeeping فقط)

**Phase 4.5 — shipped 2026-04-21**: إصدار Avoir عبر `POST /api/v1/invoices/[id]/avoir` **لا يكتب treasury_movement**. الـ avoir هو سند محاسبي عكسي (negative invoice row + negative invoice_lines) يُسجَّل في سلسلة الفواتير مع hash chain (D-37) وimmutability trigger (D-58)، دون تدفق نقدي وقت الإصدار.

**سبب هذا القرار**:
- الفاتورة الأصلية قد تكون محصَّلة بالكامل، جزئياً، أو غير محصَّلة. إصدار avoir يُنشئ التزاماً محاسبياً عكسياً قد يُسَدَّد لاحقاً بأحد عدة مسارات:
  - تحويل نقدي صريح عبر `POST /api/v1/treasury/transfer` (main_cash → ...)
  - خصم من فاتورة قادمة لنفس العميل (credit offset)
  - إبقاء الدَّين مفتوحاً في accounts receivable (خارج نطاق Phase 4)
- ربط avoir تلقائياً بـ `treasury_movement` من نوع "refund" كان سيُلزِم المستخدم بتدفق نقدي عند كل إصدار — وهذا لا يطابق واقع السيناريوهات أعلاه.

**Refund flow (إن لزم)**: بعد إصدار الـ avoir، pm/gm يُنشئ `treasury_movement` مستقلاً (category='refund' أو transfer مناسب) يشير إلى الـ avoir عبر `reference_type='invoice'` + `reference_id=<avoir_id>`. هذا المسار مؤجَّل لترانش لاحقة.

**تأثير على P&L + client receivable**:
- الـ avoir يُدرَج في totals الفواتير بمبالغ سالبة → مجموع revenue للفترة يُحسب `SUM(invoices.total_ttc_frozen WHERE NOT deleted)` ويُنقَص تلقائياً بالـ avoirs.
- client balance (المشتق من `orders.total_amount - payments` حالياً) لا يتأثر مباشرة بالـ avoir لأن avoir لا يُعدِّل orders أو payments؛ تقرير الـ receivable المحاسبي يُنتَج بـ JOIN على invoices + avoirs لاحقاً.

---

## صيغة صافي الربح (P&L)

```
صافي الربح = الإيرادات المحصّلة
           - تكلفة المشتريات
           - المصاريف
           - العمولات المكتسبة
           - تكلفة الهدايا
           - المكافآت
```

### 3 طرق عرض P&L

| الطريقة | الإيرادات | التكاليف | الاستخدام |
|---------|----------|---------|----------|
| Pipeline | كل الطلبات (محجوز + مؤكد) | كل المشتريات | رؤية المستقبل |
| Accrual | الطلبات المؤكدة فقط | المشتريات المرتبطة | المعيار المحاسبي |
| Cash Basis | المحصّل فعلياً | المدفوع فعلياً | النقد الحقيقي |

**توزيع الأرباح** يعتمد على **Cash Basis** (المحصّل - المدفوع).

---

## تسوية يومية

1. المدير/GM يُدخل الرصيد الفعلي (عدّ يدوي)
2. النظام يحسب الرصيد المتوقع من الحركات
3. الفرق يُسجل كحركة reconciliation (+ أو -)

---

---

## الدقة المالية

- NUMERIC(19,2) لكل المبالغ
- round2() = Math.round((x + ε) × 100) / 100
- التسامح: 0.01€ للمقارنات (paid ≥ total - 0.01)
- تراكم التقريب مقبول (قرار L7)
