# قاموس المصطلحات — Glossary (AR / EN)

> **رقم العنصر**: #05 | **المحور**: أ | **الحالة**: قيد التحديث

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
| SSE | Server-Sent Events — بث إشعارات فوري |
| ORM | Object-Relational Mapping — Drizzle |
| JWT | JSON Web Token — للمصادقة |
| FK | Foreign Key — مفتاح أجنبي |
| CRUD | Create, Read, Update, Delete |
| RTL | Right-to-Left — اتجاه الكتابة العربية |
| withTx | Transaction wrapper — BEGIN/COMMIT/ROLLBACK |
| FOR UPDATE | قفل على مستوى الصف لمنع التعارض |
