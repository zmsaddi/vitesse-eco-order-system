# التزامن والتعارضات — Concurrency & Conflict Handling

> **رقم العنصر**: #28 | **المحور**: و | **الحالة**: مكتمل

---

## 1. نمط المعاملات (withTx)

```javascript
async function withTx(fn) {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await fn(client);
    await client.sql`COMMIT`;
    return result;
  } catch (err) {
    await client.sql`ROLLBACK`;
    throw err;
  } finally {
    client.release();
  }
}
```

- جميع العمليات المالية تعمل داخل معاملة ذرية
- إما تنجح كلها أو تفشل كلها

---

## 2. أقفال الصفوف (FOR UPDATE)

| العملية | الجدول المقفل | السبب |
|---------|-------------|-------|
| إنشاء بيع | products | منع البيع المتزامن (oversell) |
| إنشاء مشترى | products | تسلسل تحديث المتوسط المرجح |
| تحصيل دفعة | sales | منع الدفع المتزامن (overpay) |
| دفعة مورد | purchases | منع الدفع الزائد |
| إلغاء بيع | sales | منع الإلغاء المزدوج |
| تسوية عمولات | bonuses | منع الصرف المزدوج |

---

## 3. التسلسل الذري للفواتير

```sql
INSERT INTO invoice_sequence (year, month, last_number)
VALUES ($year, $month, 1)
ON CONFLICT (year, month)
DO UPDATE SET last_number = invoice_sequence.last_number + 1
RETURNING last_number;
```

- عبارة SQL واحدة — لا يوجد race condition
- الاستدعاءات المتزامنة تنجح كلها — كل واحد يحصل على رقم فريد

---

## 4. القفل الاستشاري لتوزيع الأرباح

- PostgreSQL advisory lock على hash الفترة (start_date + end_date)
- الفترات المختلفة لا تتنافس
- نفس الفترة: الطلب الثاني ينتظر اكتمال الأول

---

## 5. حماية من الإلغاء المزدوج

- الخطوة الأولى من cancelSale: فحص `sale.status === 'ملغي'`
- إذا ملغي مسبقًا → خطأ فوري "الطلب مُلغى مسبقاً"
- يمنع استرداد مزدوج أو سجل تدقيق مكرر

---

## 6. حماية من العمولة المكررة

- **UNIQUE INDEX**: `bonuses_delivery_role_unique ON bonuses(delivery_id, role)`
- تأكيد التسليم مرتين → الثاني يحذف العمولات القديمة ويعيد إدراجها (overwrite، لا duplicate)

---

## 7. التحقق المزدوج في التسويات

- عند الإدخال: التحقق من الرصيد المتاح (client-side)
- قبل الإرسال: إعادة جلب الرصيد الحقيقي (server re-fetch)
- يكشف التسويات المتزامنة من admin آخر

---

## 8. لا يوجد Optimistic Locking

- النظام لا يستخدم version numbers أو ETags
- لا يوجد كشف لتحرير نفس السجل من مستخدمين مختلفين
- آخر كاتب يفوز (last-writer-wins) في التعديلات العادية
