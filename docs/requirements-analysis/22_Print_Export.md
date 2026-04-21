# الطباعة والتصدير — Print & Export

> **رقم العنصر**: #22 | **المحور**: د | **الحالة**: مواصفات نهائية

---

## PDF الفاتورة

### اللغة والإلزام القانوني
- **الفرنسية فقط** (متطلب قانوني — ordonnance n°2000-916).
- يحتوي: SIRET، SIREN، APE، N° TVA، mentions légales.

### البنية (ترتيبها في الصفحة) — D-35 mandatory mentions كاملة

1. **Header**: لوجو (inline SVG) + `FACTURE` (أو `AVOIR` bold — D-38 إن `avoir_of_id IS NOT NULL`) + ref code (`FAC-YYYY-MM-NNNN` — D-01) + `Date de facturation` + `Date de livraison` (D-35) + حالة-pill ملوَّنة
2. **Parties** (جدول من عمودين):
   - **Vendeur (D-35)**: `shop_name` + `shop_legal_form` (SAS) + `Capital social: {shop_capital_social} €` + `shop_address` + `shop_city` + `SIRET: {shop_siret}` + `SIREN: {shop_siren}` + `N° TVA: {shop_vat_number}` + `{shop_rcs_number}` (e.g. "RCS Poitiers 100 732 247") + `APE: {shop_ape}` + البريد + الموقع.
   - **Client**: الاسم (`client_name_frozen`) + العنوان + الهاتف + البريد (كلها snapshot من invoice).
3. **Items table** (D-30 — من `invoice_lines` frozen): Désignation | Qté | Prix Unit. HT | TVA% | Montant TVA | Total HT | Total TTC. ملاحظة AVOIR: quantity + totals **سالبة**.
4. **Totals box** (من `invoices.*_frozen`):
   ```
   Sous-total HT   : 1000.00 €
   TVA (20%)       :  200.00 €
   TOTAL TTC       : 1200.00 €
   ```
5. **Payment history** (إذا وُجدت payments): Date | Montant | Méthode.
6. **Conditions de paiement + Pénalités (D-35 — C. com L441-10)**:
   - `Conditions d'escompte: aucun`
   - `En cas de retard: pénalités = {shop_penalty_rate_annual}% annuel (taux légal BCE + 10 pts min.)`
   - `Indemnité forfaitaire de recouvrement: {shop_recovery_fee_eur} € (C. com L441-10 II)`
7. **Bank block**: IBAN + BIC (من settings — **يُرفَض توليد فاتورة إذا كانا placeholder**).
8. **Avoir reference (D-38)**: إذا `avoir_of_id IS NOT NULL` → سطر `Avoir relatif à la facture N° {FAC-original}`.
9. **Stamp**: `/public/stamp.png` (max 200×200، aspect-preserved).
10. **Footer**: SIRET | SIREN | APE | `RCS Poitiers N° {shop_rcs_number}` | ref | contact + timestamp توليد.

**مرجع**: CGI art. 242 nonies A + C. com art. L441-9 + R123-238 + D441-5. غياب أي mention = amende 15€ (CGI art. 1737).

### حالة الفاتورة (Status Pill)

| الحالة | النص | اللون |
|--------|-----|-------|
| ANNULÉE | if invoice.status='ملغي' | #dc2626 (أحمر) |
| EN ATTENTE | unpaid + no collection | #f59e0b (كهرماني) |
| PARTIELLE | some collected | #ea580c (برتقالي) |
| PAYÉE | remaining < 0.005 € AND paidTotal > 0.005 € | #16a34a (أخضر) |

### TVA (D-30 محدِّث D-02)

- **غير مخزَّنة قبل الإصدار** — عند اللحظة الفعلية لـ `POST /api/invoices` (status='مؤكد')، تُجمَّد في `invoices.tva_amount_frozen` + `invoices.vat_rate_frozen` + `invoice_lines.vat_amount_frozen` (D-30).
- بعد الإصدار، render PDF **يقرأ فقط** من الأعمدة المُجمَّدة — **ليس** من `settings.vat_rate` ولا من `order_items`.
- المنطق: قبل الإصدار = TVA محسوبة ديناميكياً؛ بعد الإصدار = frozen (loi anti-fraude TVA 2018 art. 286-I-3° bis).
- Rounding tolerance: `0.005 €` (half cent) لامتصاص FP drift.

### Payment Method Labels (فرنسي)

| القيمة في DB | الوسم في الفاتورة |
|-------------|-------------------|
| `كاش` | Espèces / À la livraison |
| `بنك` | Virement bancaire |
| `آجل` | Crédit (paiement différé) |

### الهدايا

- تظهر كصف عادي مع `Prix Unit. HT = 0` + ملاحظة "CADEAU" في عمود الوصف.
- لا تُضاف للـ total (line_total = 0).

### الترقيم

- الشكل: `FAC-YYYY-MM-NNNN` (4 أرقام zero-padded).
- التسلسل شهري (`invoice_sequence` جدول PK على year+month).
- ذري: `SELECT ... FOR UPDATE` ثم `UPDATE last_number = last_number + 1`.
- **Avoir (D-38)**: يستخدم نفس التسلسل `FAC-YYYY-MM-NNNN` (لا prefix منفصل). الـ PDF يعرض "AVOIR" بدل "FACTURE" عند `avoir_of_id IS NOT NULL`.

### الإلغاء

- `invoice.status='ملغي'` → حالة ANNULÉE في الـ pill.
- **لا يُحذف صف** — soft cancel فقط (BR-65).
- **لا يُعدَّل total** — immutability triggers (D-58) + hash chain (D-37) يضمنان ذلك. التصحيح يتم عبر Avoir (D-38).

### Avoir PDF (D-38 + Phase 4.5)

عندما `invoice.avoirOfId != null` يتبدَّل الـ PDF header:

- **العنوان**: `AVOIR` bold بدل `FACTURE`.
- **سطر مرجع تحت العنوان** (fontSize 9): `Avoir de la facture {parentRefCode} du {parentDate}` — مثال: `Avoir de la facture FAC-2026-04-0023 du 2026-04-15`.
- **ref-code** على نفس نمط الفاتورة: `FAC-YYYY-MM-NNNN` (تسلسل موحَّد — D-38).
- **المبالغ** تُعرض بالسالب كما هي مُجمَّدة على الصف: `total_ttc_frozen < 0` (CHECK على DB).
- **quantity على كل سطر** سالب: `-1`، `-0.50`، إلخ.
- **باقي الصفحة** مطابق للفاتورة العادية: vendor block (D-35 mentions كاملة من `vendorSnapshot`)، client block، items table، totals، payment history (فارغة على الـ avoir)، legal footer (شروط الدفع + IBAN/BIC).

**تنفيذ تقني**: الفرع (title + referenceLine) مُستخلَص إلى helper نقي `buildInvoiceHeaderLines(invoice, avoirParent)` في `src/modules/invoices/pdf-header.ts` مع unit tests صريحة تُثبت `AVOIR` + `parentRefCode` + `parentDate` — منفصل عن pdfkit render لتجنّب الاعتماد على استخراج نص PDF في الاختبارات.

**`avoirParent` payload**: `{ refCode: string, date: string } | null` على `InvoiceDetailDto` — **ليس داخل** `VendorSnapshot` (الذي هو Zod schema للكتلة القانونية للبائع). `getInvoiceById` يعبِّئه عبر `LEFT JOIN invoices parent ON parent.id = invoice.avoir_of_id`.

### Cairo font (D-56)

- TTFs في `public/fonts/cairo/` (400 + 700 weights).
- **Subset mandatory** للـ PDF لتقليل الحجم: `fonttools pyftsubset cairo-regular.ttf --subset-file=subset-chars.txt` → `public/fonts/cairo/subset/cairo-{weight}-subset.ttf`.
- Subset يغطي: Latin Basic + Arabic presentation forms A/B + أرقام + punctuation.
- حجم subset ≈ 40-60KB (من ~300KB).

### PDF generation flow (D-55 — خارج المعاملة)

```
transaction A (~50ms):
  1. INSERT invoices + invoice_lines + increment invoice_sequence
  2. COMMIT
background (بعد COMMIT، non-blocking):
  3. generate PDF بـ @react-pdf/renderer
  4. upload to Blob: `invoices/{invoice_id}.pdf` (D-60)
  5. UPDATE invoices.pdf_url
```
**السبب**: مولِّد PDF داخل transaction يُمدِّد lock على `invoice_sequence` ~300ms ويمنع إصدار فواتير أخرى متزامنة. D-55 يفصلهما.

**Blob caching (D-56)**: PDF مُخزَّن بـ deterministic key + TTL 30d. render ثاني = redirect مباشر لـ Blob URL (لا re-generation).

---

## PDF الكتالوج

- **3 لغات**: AR / EN / FR — المستخدم يختار عند التوليد.
- **بدون أسعار** نهائياً.
- **فلتر**: الكل، أو `catalog_visible=true AND active=true AND stock > 0`.
- **صفحة لكل منتج**: صورة رئيسية (is_primary=true) + صور مصغرة + الاسم + `description_long` + `specs` (JSON معروض كـ definition list).
- **Header**: لوجو + بيانات الاتصال.
- **Footer**: SIRET + تاريخ التوليد.

### التوليد

`POST /api/catalog/pdf` body: `{ language: 'ar'|'en'|'fr', filter: 'all'|'in_stock' }` → returns PDF blob.

المولِّد: `@react-pdf/renderer` (سريع، يعمل داخل Function بلا browser).

---

## CSV Export

**متوفر في كل DataTable** (زر "تصدير CSV" في FilterBar).

### التنسيق (قرار M13)

- **فاصل الحقول**: `;` (فاصلة منقوطة — لتوافق Excel الفرنسي بلا إعداد locale).
- **أرقام عشرية**: `.` (نقطة).
- **تواريخ**: ISO `YYYY-MM-DD` أو `YYYY-MM-DDTHH:mm:ss+02:00` لـ TIMESTAMPTZ.
- **الترميز**: UTF-8 مع BOM (`\uFEFF`) في بداية الملف ليفهمه Excel.
- **اسم الملف**: `{entity}-{YYYYMMDD-HHmm}.csv`.

### الأعمدة المُصدَّرة

- **تحترم رؤية الدور**: seller لا يحصل على عمود `buy_price` في CSV حتى لو طلبه.
- **تطابق أعمدة الجدول المرئية** في UI + عمود `id` مخفي لضمان التتبع.

### أمثلة

```
orders-20260418-1430.csv:
id;ref_code;date;client_name;total_amount;payment_method;status
1;SL-20260418-123XYZ;2026-04-18;أحمد;1200.00;كاش;مؤكد
```

---

## الطباعة المباشرة

- **الفاتورة**: `GET /api/invoices/[id]/pdf` → يُفتح في تبويب جديد، يمكن طباعة من المتصفح.
- **القيد العملي**: لا Gesamt printer setup — الاعتماد على "Print to PDF" من المتصفح.

---

## حقوق التصدير

| التقرير/الجدول | PM/GM | Manager | Seller | Driver | Stock Keeper |
|----------------|:---:|:-------:|:------:|:------:|:------------:|
| فاتورة PDF | ✅ | ✅ | ✅ (خاصتها) | ✅ (خاصته) | ❌ |
| كتالوج PDF | ✅ | ✅ | ✅ | ❌ | ✅ |
| CSV الطلبات | ✅ | ✅ | ✅ (خاصتها، بلا cost_price) | ❌ | ❌ |
| CSV المخزون | ✅ | ✅ | ✅ (بلا buy_price) | ❌ | ✅ |
| CSV العملاء | ✅ | ✅ | ✅ | ❌ | ❌ |
| CSV التقارير المالية | ✅ | ✅ | ❌ | ❌ | ❌ |
