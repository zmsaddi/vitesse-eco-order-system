# خريطة الاعتماديات — Module Dependencies

> **رقم العنصر**: #04 | **المحور**: أ | **الحالة**: قيد التحديث

---

## خريطة التأثيرات المتسلسلة

### عند إنشاء طلب (Order)
```
طلب جديد
  → حجز مخزون لكل صنف (order_items → products.stock ↓)
  → إنشاء عميل تلقائي إذا جديد (→ clients)
  → إنشاء توصيل تلقائي (→ deliveries)
  → خصم gift_pool.remaining إذا هدية
```

### عند تأكيد التسليم
```
تسليم مؤكد
  → طلب → مؤكد (orders.status)
  → عمولة لكل صنف حسب الفئة (→ bonuses × N items)
  → عمولة سائق (→ bonuses × 1)
  → فاتورة (→ invoices + invoice_sequence)
  → تحصيل دفعة (→ payments)
  → حركة treasury (→ treasury_movements inflow)
```

### عند إلغاء طلب (شاشة C1)
```
إلغاء طلب
  → طلب → ملغي
  → توصيل → ملغي
  → فاتورة → ملغي (soft — BR-65)
  → استرداد دفعات (→ payments type=refund)
  → حركة treasury (refund inflow)
  → [اختياري] استعادة مخزون (products.stock ↑)
  → [اختياري] حذف/عكس عمولات (bonuses → delete أو تسوية سالبة)
  → [اختياري] إعادة gift_pool.remaining
  → سجل (→ cancellations)
```

### عند شراء (Purchase)
```
مشتريات
  → مخزون ↑ (products.stock)
  → متوسط مرجح (products.buy_price)
  → سجل أسعار (→ price_history)
  → دفعة مورد (→ supplier_payments)
  → حركة treasury (outflow)
```

### عند حذف مشتريات (شاشة C5)
```
حذف مشتريات
  → مخزون ↓
  → إعادة حساب المتوسط المرجح
  → [سؤال] استرداد المبلغ؟ → treasury inflow أو supplier credit
```

### عند تسوية/مكافأة
```
تسوية
  → bonuses.settled = true + settlement_id
  → حركة treasury (outflow)
مكافأة
  → settlements (نوع مكافأة)
  → تُسجل كمصروف (تُخصم من الأرباح)
  → حركة treasury (outflow)
```

### عند تسليم أموال السائق
```
سائق يسلّم
  → treasury_movements: transfer (driver_custody → manager_box)
  → رصيد السائق ↓، رصيد المدير ↑
```

---

## مصفوفة التبعيات

| الوحدة | تعتمد على |
|--------|----------|
| orders | products, clients, deliveries, gift_pool |
| order_items | orders, products, product_commission_rules |
| deliveries | orders, driver_tasks |
| invoices | orders, deliveries, invoice_sequence |
| bonuses | orders, deliveries, product_commission_rules, user_bonus_rates, settings |
| payments | orders, clients, treasury_movements |
| settlements | bonuses, users, treasury_movements |
| profit_distributions | orders, payments, expenses, bonuses, settlements |
| treasury_movements | treasury_accounts, (كل العمليات المالية) |
| purchases | products, suppliers, supplier_payments, price_history, treasury_movements |
| expenses | treasury_movements |
| inventory_counts | products |
| notifications | users, (كل العمليات) |
| activity_log | users, (كل العمليات) |
