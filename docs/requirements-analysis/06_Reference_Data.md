# البيانات المرجعية — Reference Data

> **رقم العنصر**: #06 | **المحور**: أ | **الحالة**: مواصفات نهائية

---

## الأدوار

| الرمز | العربي | الإنجليزي |
|-------|--------|----------|
| pm | مدير المشروع | Project Manager |
| gm | مدير عام | General Manager |
| manager | مدير | Manager |
| seller | بائع | Seller |
| driver | سائق | Driver |
| stock_keeper | أمين مخزن | Stock Keeper |

## حالات الطلب (Order Status)

| القيمة | المعنى |
|--------|--------|
| محجوز | تم الإنشاء — المخزون محجوز |
| قيد التحضير | أمين المخزن يحضّر الأصناف |
| جاهز | الأصناف جاهزة للتوصيل |
| مؤكد | تم التسليم — فاتورة + عمولة |
| ملغي | ملغي — حسب شاشة C1 |

## حالات الدفع (Payment Status)

| القيمة | المعنى |
|--------|--------|
| pending | لم يُدفع شيء |
| partial | دُفع جزء |
| paid | مدفوع بالكامل (≤ 0.01€ فرق) |
| cancelled | ملغي |

## حالات التوصيل (Delivery Status)

| القيمة | المعنى |
|--------|--------|
| قيد الانتظار | بانتظار التحضير/التعيين |
| قيد التحضير | يُحضّر بواسطة أمين المخزن |
| جاهز | جاهز للتوصيل |
| جاري التوصيل | السائق في الطريق |
| تم التوصيل | تم التسليم بنجاح |
| ملغي | ملغي |

## طرق الدفع (Payment Method)

| القيمة | المعنى |
|--------|--------|
| كاش | نقداً — دفع كامل عند التسليم |
| بنك | تحويل بنكي — دفع كامل عند التسليم |
| آجل | ائتمان — دفعة مقدمة اختيارية |

## أنواع مهام السائق (Driver Task Type)

| القيمة | المعنى |
|--------|--------|
| delivery | توصيل للعميل |
| supplier_pickup | جلب من مورد |
| collection | تحصيل أموال |

## أنواع حركات الصندوق (Treasury Movement Category)

| القيمة | المعنى |
|--------|--------|
| sale_collection | تحصيل من عميل |
| supplier_payment | دفع لمورد |
| expense | مصروف |
| settlement | تسوية عمولة |
| reward | مكافأة |
| profit_distribution | توزيع أرباح |
| driver_handover | سائق يسلّم لمدير |
| manager_settlement | مدير يسوّي مع GM |
| funding | تمويل من GM لمدير |
| bank_deposit | إيداع كاش في بنك |
| bank_withdrawal | سحب من بنك |
| refund | استرداد عند إلغاء |
| reconciliation | تسجيل فرق في التسوية اليومية |

**ملاحظة**: `supplier_credit` **محذوف** من هذه الفئات (D-10). الرصيد الدائن للمورد يُتابَع في عمود `suppliers.credit_due_from_supplier` خارج treasury.

## أنواع الصناديق (Treasury Account Type)

| القيمة | المعنى |
|--------|--------|
| main_cash | صندوق GM — كاش |
| main_bank | صندوق GM — بنك |
| manager_box | صندوق مدير فرعي |
| driver_custody | عهدة سائق |

## فئات المصاريف (Expense Categories)

إيجار، رواتب، وقود، صيانة، اتصالات، تسويق، تأمين، ضرائب، أخرى

## فئات المنتجات (Product Categories)

دراجات كهربائية، سكوترات، إكسسوارات، قطع غيار، بطاريات، شواحن، أخرى

## أنواع الخصم (Discount Type)

| القيمة | المعنى |
|--------|--------|
| percent | نسبة مئوية |
| fixed | مبلغ ثابت |
| NULL | لا خصم |

## أنواع الدفعات (Payment Type)

| القيمة | المعنى |
|--------|--------|
| collection | تحصيل عادي |
| refund | استرداد |
| advance | دفعة مقدمة |

## خيارات الإلغاء (Cancellation Bonus Action)

| القيمة | المعنى |
|--------|--------|
| keep | إبقاء صف العمولة بحالة `retained` — لا تُسوَّى في الدورة القادمة |
| cancel_unpaid | حذف صف العمولة غير المسواة نهائياً |
| cancel_as_debt | تسجيل دين (settlement سالب) — يُخصم من الدفعة التالية |

## مفاتيح الإعدادات الرئيسية (Settings Keys)

### هوية المتجر (تتطلب تعبئة قبل الإنتاج — D-35 mandatory mentions)

| Key | قيمة افتراضية | ملاحظة قانونية |
|-----|-------------|-----------------|
| shop_name | VITESSE ECO SAS | Raison sociale (CGI art. 242 nonies A) |
| shop_legal_form | SAS | C. com art. R123-238 |
| shop_siren | 100 732 247 | |
| shop_siret | 100 732 247 00018 | |
| shop_ape | 46.90Z | |
| shop_vat_number | FR43100732247 | N° TVA intracommunautaire |
| shop_address | 32 Rue du Faubourg du Pont Neuf | |
| shop_city | 86000 Poitiers, France | |
| shop_email | contact@vitesse-eco.fr | |
| shop_website | www.vitesse-eco.fr | |
| shop_iban | (à compléter) | **يجب تعبئته قبل توليد أول فاتورة** |
| shop_bic | (à compléter) | **يجب تعبئته قبل توليد أول فاتورة** |
| shop_capital_social | (à compléter) | **D-35 + C. com art. R123-238** — إلزامي للـ SAS. Ex: `10000` (EUR). |
| shop_rcs_city | Poitiers | **D-35** — ville du RCS |
| shop_rcs_number | (à compléter) | **D-35** — e.g. `RCS Poitiers 100 732 247` |
| shop_penalty_rate_annual | 10.5 | **D-35 + C. com L441-10** — taux de pénalité de retard annuel (%). Par défaut BCE + 10 pts. |
| shop_recovery_fee_eur | 40 | **D-35 + C. com L441-10** — indemnité forfaitaire de recouvrement (€). Législation: 40€ minimum. |

**ملاحظة قانونية**: غياب أي mention من الأعلى = amende 15€/mention/facture (CGI art. 1737).

### التسعير والعمولات

| Key | قيمة افتراضية | ملاحظة |
|-----|-------------|--------|
| vat_rate | 20 | % (المعدل الفرنسي القياسي) |
| invoice_currency | EUR | |
| seller_bonus_fixed | 10 | €/وحدة |
| seller_bonus_percentage | 40 | % من overage |
| driver_bonus_fixed | 10 | €/وحدة |
| max_discount_seller_pct | 5 | BR-41 |
| max_discount_manager_pct | 15 | BR-41 |

### التحكم والتقييد

| Key | قيمة افتراضية | ملاحظة |
|-----|-------------|--------|
| vin_required_categories | `["دراجات كهربائية","دراجات عادية"]` | JSON array |
| driver_custody_cap_eur | 2000 | حد نقدي للسائق قبل الحوالة الإجبارية |
| voice_rate_limit_per_min | 10 | |
| voice_max_audio_seconds | 30 | |
| voice_min_audio_ms | 1500 | |
| auto_refresh_interval_ms | 60000 | |
| sku_limit | 500 | حد أقصى لعدد المنتجات النشطة (D-25) |
| max_images_per_product | 3 | D-25 |

**ملاحظة**: مفتاح `invoice_mode` **محذوف** (D-09). قالب الفاتورة ثابت وسلوك الإلغاء موصوف في `09_Business_Rules.md`.

### Retention

| Key | قيمة افتراضية | ملاحظة |
|-----|-------------|--------|
| activity_log_retention_days | 90 | |
| voice_logs_retention_days | 30 | |
| read_notifications_retention_days | 60 | |

### Monitoring (D-42)

| Key | قيمة افتراضية | ملاحظة |
|-----|-------------|--------|
| neon_hours_used_this_month | 0 | يُحدَّث بواسطة `/api/cron/hourly` (D-42). للمراقبة قرب سقف 190h/شهر. |

**ملاحظة**: قائمة المفاتيح الحصرية مُطبَّقة كـ CHECK constraint على `settings.key` (راجع D-28 في `02_DB_Tree.md`). أي مفتاح جديد = migration + تحديث ENUM + تحديث `SettingsSchema` Zod.
