# التزامن — Concurrency

> **رقم العنصر**: #29 | **المحور**: و | **الحالة**: قيد التحديث

---

## عمليات تتطلب FOR UPDATE lock

| العملية | الجدول المقفل | السبب |
|---------|-------------|-------|
| حجز مخزون (بيع) | products | منع oversell |
| إعادة مخزون (إلغاء) | products | ذرية |
| تحصيل دفعة | orders | منع overpayment |
| تحديث رصيد صندوق | treasury_accounts | ذرية الرصيد |
| أخذ هدية | gift_pool | منع سحب أكثر من المتاح |
| تسوية عمولة | bonuses | منع تسوية مزدوجة |
| ترقيم فاتورة | invoice_sequence | INSERT ON CONFLICT ذري |

## withTx() — كل العمليات المالية

كل عملية تمس أموالاً تُلف بـ `withTx()`: BEGIN → عمليات → COMMIT أو ROLLBACK.

## لا optimistic locking

النظام لا يستخدم version columns. القفل يتم على مستوى الصف (FOR UPDATE).
