# خريطة الحالات والانتقالات — State Transitions

> **رقم العنصر**: #08 | **المحور**: ب | **الحالة**: مواصفات نهائية

---

## 1. حالات الطلب (Order Status)

```
محجوز ──→ قيد التحضير ──→ جاهز ──→ مؤكد
  │            │              │
  └──→ ملغي ←─┘──→ ملغي ←────┘──→ ملغي
```

| من | إلى | المُنفّذ | الشرط |
|----|-----|---------|-------|
| محجوز | قيد التحضير | النظام (تلقائي) | عند تعيين stock_keeper أو بدء التحضير |
| محجوز | ملغي | PM/GM/Manager/Seller(خاصتي) | شاشة C1 + سبب |
| قيد التحضير | جاهز | Stock Keeper / PM/GM/Manager | بعد تحضير كل الأصناف |
| قيد التحضير | ملغي | PM/GM/Manager | شاشة C1 + سبب |
| جاهز | مؤكد | السائق/PM/GM/Manager | عند تأكيد التسليم |
| جاهز | ملغي | PM/GM/Manager | شاشة C1 + سبب |
| مؤكد | ملغي | PM/GM | شاشة C1 + سبب (عمولات → دين إذا مصروفة) |

**ملاحظة**: لا يوجد انتقال من "ملغي" لأي حالة أخرى — الإلغاء نهائي.
**ملاحظة**: لا يوجد انتقال "تعديل" على مؤكد — إلغاء فقط (BR-28).
**التعديل مسموح فقط** في حالة "محجوز" (BR-27).

---

## 2. حالات الدفع (Payment Status)

```
pending ──→ partial ──→ paid
   │           │
   └──→ cancelled ←──┘
```

| من | إلى | الشرط |
|----|-----|-------|
| pending | partial | 0 < paid_amount < total - 0.01 |
| pending | paid | paid_amount ≥ total - 0.01 |
| partial | paid | paid_amount ≥ total - 0.01 |
| أي | cancelled | عند إلغاء الطلب |

**كل الأرقام TTC** (قرار H1).

---

## 3. حالات التوصيل (Delivery Status)

```
قيد الانتظار ──→ قيد التحضير ──→ جاهز ──→ جاري التوصيل ──→ تم التوصيل
      │               │            │              │
      └── ملغي ←───────┘── ملغي ←──┘── ملغي ←─────┘
                                    (يعود قيد الانتظار)
```

| من | إلى | المُنفّذ | الشرط |
|----|-----|---------|-------|
| قيد الانتظار | قيد التحضير | النظام | مع حالة الطلب |
| قيد التحضير | جاهز | Stock Keeper | بعد تحضير الأصناف |
| جاهز | جاري التوصيل | السائق/PM/GM/Manager | بعد تعيين سائق |
| جاري التوصيل | تم التوصيل | السائق/PM/GM/Manager | VIN + تأكيد → عمولة + فاتورة |
| جاري التوصيل | قيد الانتظار | PM/GM/Manager | إلغاء توصيل + سبب (قرار H2) — ليس إلغاء بيع |
| أي (غير مؤكد) | ملغي | PM/GM/Manager | عند إلغاء الطلب |

---

## 4. حالات مهمة السائق (Driver Task Status)

```
pending ──→ in_progress ──→ completed
   │             │
   └── cancelled ←┘
```

| من | إلى | المُنفّذ |
|----|-----|---------|
| pending | in_progress | السائق |
| in_progress | completed | السائق |
| pending/in_progress | cancelled | PM/GM/Manager |

---

## 5. حالات الفاتورة (Invoice Status)

```
مؤكد ──→ ملغي
```

| من | إلى | المُنفّذ | الشرط |
|----|-----|---------|-------|
| مؤكد | ملغي | PM/GM | عند إلغاء الطلب (soft — BR-65) |

**ملاحظة**: الفواتير لا تُحذف — تُلغى فقط (حذف ناعم).

---

## 6. حالات العمولة (Bonus Status)

Phase 4.4 — القيم الكنسية للحالات هي `unpaid | settled | retained` (كانت `unsettled` في نسخ قديمة من الوثيقة — الكود لم يستعمل هذا التوكن).

```
        ┌──→ retained (keep)
unpaid ─┼──→ deleted (cancel_unpaid)
        └──→ settled ──→ settlements(type='debt', applied=false) (cancel_as_debt)
```

| من | إلى | الـ action | الشرط |
|----|-----|-----------|-------|
| unpaid | retained | `keep` | `cancellations.seller_bonus_action='keep'` — يُعلَم بـ status='retained'، يُستبعد من التسويات |
| unpaid | deleted | `cancel_unpaid` | `cancellations.seller_bonus_action='cancel_unpaid'` — soft-delete (deleted_at=NOW) |
| unpaid | settled | — | عبر `POST /api/v1/settlements { kind:'settlement' }` ناجح |
| settled | — (bonus stays settled) | `cancel_as_debt` | Phase 4.4: INSERT `settlements(type='debt', amount=-SUM(total_bonus), applied=false, payment_method='N/A')`. البونص نفسه يبقى settled تاريخياً — الدَّين يُستهلك من التسوية التالية لنفس المستخدم/الدور تلقائياً |

### الـ 7 invariants الحاكمة للإلغاء

كل اختبار يحمي قاعدة تجارية. تُنفَّذ كـ Vitest specs في Phase 3.

| # | Invariant | الوصف |
|---|-----------|-------|
| C1 | hard cancel bonuses | `bonusActions={cancel_unpaid, cancel_unpaid}` + `return_to_stock=true` → status=ملغي، stock مُستعاد، bonuses DELETEd على السطح (في الواقع soft-delete)، invoice=ملغي، activity_log مكتوب |
| C2 | keep bonuses | `bonusActions={keep, keep}` → status=ملغي لكن bonuses موجودة بـ status=retained |
| C3 | required choice | POST cancel بلا bonusActions + bonuses exist → 428 BONUS_CHOICE_REQUIRED مع preview |
| C4 | settled bonus as debt | `bonusActions.seller=cancel_as_debt` + bonus.settled=true → INSERT settlement سالب مقابل |
| C5 | preview safety | GET cancel/preview لا يكتب أي شيء؛ يعمل حتى على سجل ملغي مسبقاً |
| C7 | cancel delivery ≠ cancel order | إلغاء توصيل `جاري التوصيل` → يعود `قيد الانتظار`، الطلب يبقى `محجوز` (قرار H2) |
| C8 | idempotency | POST cancel مرتين → الثانية 409 ALREADY_CANCELLED، لا تغيير على الحالة المالية |

**ملاحظة**: invariant C6 السابقة (hard-delete بواسطة PM) **محذوفة كلياً** (D-04). لا endpoint يُنفِّذ DELETE فعلي على الطلبات/التوصيلات/الفواتير/العمولات حتى لـ PM. الحذف الناعم مطلق (BR-48). القائمة الآن 7 invariants (C1..C5 + C7 + C8).

---

## 7. حالات دفعة المورد (Purchase Payment Status)

```
paid ←→ partial ←→ pending
```

يُحسب تلقائياً من paid_amount vs total.

---

## 8. حالات المنتج (Product Active Status)

```
active (true) ←→ inactive (false)
```

| من | إلى | المُنفّذ |
|----|-----|---------|
| active | inactive | PM/GM |
| inactive | active | PM/GM |

**ملاحظة**: لا حذف نهائي (BR-06).
