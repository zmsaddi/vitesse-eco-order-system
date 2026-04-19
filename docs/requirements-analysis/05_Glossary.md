# قاموس المصطلحات — Glossary (AR / EN)

> **رقم العنصر**: #05 | **المحور**: أ | **الحالة**: مواصفات نهائية

---

## الأدوار

| العربي | الإنجليزي | الرمز |
|--------|----------|-------|
| مدير المشروع | Project Manager | pm |
| مدير عام | General Manager | gm |
| مدير | Manager | manager |
| بائع | Seller | seller |
| سائق | Driver | driver |
| أمين مخزن | Stock Keeper | stock_keeper |

## الكيانات الأساسية

| العربي | الإنجليزي | الجدول |
|--------|----------|-------|
| طلب | Order | orders |
| صنف الطلب | Order Item | order_items |
| مشتريات | Purchase | purchases |
| مصاريف | Expense | expenses |
| توصيل | Delivery | deliveries |
| مهمة سائق | Driver Task | driver_tasks |
| فاتورة | Invoice | invoices |
| عمولة | Bonus / Commission | bonuses |
| تسوية | Settlement | settlements |
| مكافأة | Reward | settlements (type=reward) |
| تحضير | Preparation | (حالة في orders) |
| منتج | Product | products |
| عميل | Client | clients |
| مورد | Supplier | suppliers |
| مستخدم | User | users |
| إعدادات | Settings | settings |
| صندوق | Treasury Account | treasury_accounts |
| حركة مالية | Treasury Movement | treasury_movements |
| عهدة نقدية | Driver Custody | treasury_accounts (type=driver_custody) |
| هدية | Gift | order_items (is_gift=true) |
| مجمع هدايا | Gift Pool | gift_pool |
| خصم | Discount | order_items (discount_type) |
| جرد | Inventory Count | inventory_counts |
| توزيع أرباح | Profit Distribution | profit_distributions |
| سجل نشاطات | Activity Log | activity_log |
| إشعار | Notification | notifications |
| صلاحية | Permission | permissions |
| سجل أسعار | Price History | price_history |
| إلغاء | Cancellation | cancellations |
| دفعة | Payment | payments |
| دفعة مورد | Supplier Payment | supplier_payments |
| جدول دفعات | Payment Schedule | payment_schedule |

## المصطلحات المالية

| العربي | الإنجليزي | ملاحظة |
|--------|----------|--------|
| TTC | Toutes Taxes Comprises | شامل الضريبة — كل أرقام النظام |
| HT | Hors Taxes | بدون ضريبة — للفاتورة فقط |
| TVA | Taxe sur la Valeur Ajoutée | ضريبة القيمة المضافة — تُحسب عند الفاتورة |
| متوسط مرجح | Weighted Average | لحساب buy_price عند الشراء |
| تسوية يومية | Daily Reconciliation | مقارنة الرصيد الفعلي بالمحسوب |
| دين استرداد | Recovery Debt | تسوية سالبة عند إلغاء عمولة مصروفة |
| حذف ناعم | Soft Delete | تغيير حالة بدل حذف نهائي |

## حالات الطلب

| العربي | الإنجليزي |
|--------|----------|
| محجوز | Reserved |
| قيد التحضير | In Preparation |
| جاهز | Ready |
| مؤكد | Confirmed |
| ملغي | Cancelled |

## حالات الدفع

| العربي | الإنجليزي |
|--------|----------|
| معلّق | Pending |
| جزئي | Partial |
| مدفوع | Paid |
| ملغي | Cancelled |

## طرق الدفع

| العربي | الإنجليزي |
|--------|----------|
| كاش | Cash |
| بنك | Bank Transfer |
| آجل | Credit |

## مصطلحات تقنية

| المصطلح | المعنى |
|---------|--------|
| ~~SSE~~ | ~~Server-Sent Events~~ — **محذوف من v2** (D-41). Polling فقط لأن Neon HTTP لا يدعم LISTEN/NOTIFY. |
| ORM | Object-Relational Mapping — Drizzle |
| JWT | JSON Web Token — للمصادقة (Auth.js v5) |
| FK | Foreign Key — مفتاح أجنبي |
| CRUD | Create, Read, Update, Delete |
| RTL | Right-to-Left — اتجاه الكتابة العربية |
| withTx | Transaction wrapper — drizzle-orm/neon-serverless `transaction()` |
| FOR UPDATE | قفل على مستوى الصف لمنع التعارض |
| pg_advisory_xact_lock | قفل ذري لمدة transaction (مستخدم في profit distribution cap) |

## المصطلحات الصوتية

| المصطلح | المعنى |
|---------|--------|
| Whisper | Groq STT model — تحويل صوت إلى نص عربي |
| Llama 3.1 8B Instant | Groq NLP model — استخراج JSON من النص العربي |
| entity_aliases | الأسماء البديلة (English + Arabic transliterations) |
| ai_corrections | تصحيحات المستخدم بعد عرض output الـ AI |
| ai_patterns | أنماط تعزيز متكررة (frequency-based) |
| normalizeArabicText | pipeline 4-phase لتوحيد الأرقام والحروف العربية |
| normalizeForMatching | توحيد عميق (Alif variants, Taa Marbuta, Hamza, eastern digits) لـ fuzzy match |
| Fuse.js | مكتبة fuzzy search — threshold 0.45 |
| Jaro-Winkler | خوارزمية تشابه السلاسل — threshold 0.7 |
| Arabic-safe boundary | بديل `\b` لأن JavaScript `\b` يفشل على العربية (BUG-01) |
