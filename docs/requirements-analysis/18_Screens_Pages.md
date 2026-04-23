# الشاشات والصفحات — Screens & Pages

> **رقم العنصر**: #18 | **المحور**: د | **الحالة**: مواصفات نهائية

---

## 4 أنماط صفحات

| النمط | الهيكل | يُستخدم في |
|-------|-------|-----------|
| **CRUD** | PageShell + FormCard + FilterBar + SummaryCards + DataTable + Pagination | الطلبات، المشتريات، المصاريف، العملاء، الموردين، المستخدمين، التسويات، الفواتير، المخزون، الجرد |
| **Detail** | PageShell + InfoCard + Tabs (سجلات + دفعات + نشاط) | تفاصيل عميل/مورد/منتج، عمولتي |
| **Dashboard** | PageShell + KPI Cards + Tabs (ملخص + تقارير + أرصدة) + Charts | لوحة التحكم (مخصصة لكل دور) |
| **Tasks** | PageShell + SummaryCards + TaskCards | مهام السائق، تحضير الطلبات |

---

## خريطة الصفحات (25 صفحة)

| # | الصفحة | المسار | النمط | المرحلة |
|---|--------|--------|:-----:|:-------:|
| 1 | تسجيل الدخول | `/login` | خاص | 1 |
| 2 | لوحة التحكم | `/dashboard` | Dashboard | 5 |
| 3 | الطلبات | `/orders` | CRUD | 3 |
| 4 | المشتريات | `/purchases` | CRUD | 3 |
| 5 | المصاريف | `/expenses` | CRUD | 3 |
| 6 | التوصيلات | `/deliveries` | CRUD | 4 |
| 7 | مهام السائق | `/driver-tasks` | Tasks | 4 |
| 8 | تحضير الطلبات (Stock Keeper) | `/preparation` | Tasks | 4 |
| 9 | الفواتير | `/invoices` | CRUD | 4 |
| 10 | الصندوق | `/treasury` | CRUD+Detail | 4 |
| 11 | التسويات | `/settlements` | CRUD | 4.4 |
| 12 | توزيع الأرباح | `/distributions` | CRUD | 6 |
| 13 | المخزون | `/stock` | CRUD | 2 |
| 14 | صفحة منتج | `/stock/[id]` | Detail | 2 |
| 15 | كتالوج PDF | `/catalog` | خاص | 2 |
| 16 | العملاء | `/clients` | CRUD | 2 |
| 17 | تفاصيل عميل | `/clients/[id]` | Detail | 2 |
| 18 | الموردين | `/suppliers` | CRUD | 2 |
| 19 | تفاصيل مورد | `/suppliers/[id]` | Detail | 2 |
| 20 | الجرد | `/inventory` | CRUD | 2 |
| 21 | عمولتي | `/my-bonus` | Detail | 4.4 |
| 22 | المستخدمين | `/users` | CRUD | 2 |
| 23 | الإعدادات | `/settings` | خاص | 2 |
| 24 | الصلاحيات | `/permissions` | خاص | 6 |
| 25 | سجل النشاطات | `/activity` | Read-only | 5.2 (shipped) |

تفاصيل الأدوار لكل صفحة في ملف `15_Roles_Permissions.md`.

### Onboarding Modal (D-49 — جديد)

ليس صفحة مستقلة — هو modal overlay يظهر على الصفحة الأولى (role-home) عند أول تسجيل دخول:
- pm/gm/manager → `/action-hub` (D-72: الـ admin home ليس `/dashboard`).
- seller → `/orders` (role-home).
- driver → `/driver-tasks`.
- stock_keeper → `/preparation`.

الـ modal مستقل عن الـ route ويُركَّب في layout الـ `(app)` على أساس `user.onboarded_at === null`:

```ts
// في src/app/(app)/layout.tsx (conceptual — تفاصيل التنفيذ في Phase 5 polish)
if (user.onboarded_at === null) {
  return <WelcomeModal role={user.role} onComplete={markOnboarded} />;
}
```

**محتوى role-specific**:
- **seller**: checklist (3 مهام): 1) إنشاء أول طلب، 2) تجربة الإدخال الصوتي، 3) عرض عمولتك في `/bonuses`.
- **driver**: checklist (3): 1) عرض مهامك `/tasks`، 2) تجربة "تحصيل دفعة"، 3) فهم سقف العهدة.
- **stock_keeper**: (3): 1) أمر تحضير من `/preparation`، 2) إدخال جرد، 3) تنبيه المخزون المنخفض.
- **manager**: (4): 1) تسوية يومية `/treasury/reconciliation`، 2) مراجعة طلبات فريقك، 3) تسوية عمولات، 4) عرض سجل نشاط الفريق.
- **gm**: (5): 1) تعبئة settings (SIRET/RCS/Capital — D-35)، 2) إنشاء صندوق رئيسي، 3) تمويل mangers، 4) توزيع أرباح أول دورة، 5) مراجعة attestation éditeur.
- **pm**: (6): كل ما في gm + إدارة `/permissions` + دعوة users.

**Tooltips سياقية**: dismissible، تُحفَظ في `localStorage[user_id + 'dismissed_tooltips']`.

**زر "إكمال الـ onboarding"** → `PUT /api/users/me/onboard` → `UPDATE users SET onboarded_at=NOW()` → إخفاء الـ modal + checklist collapsible داخل role-home.

---

## مكونات كل صفحة

| الصفحة | نموذج | جدول | فلاتر | بطاقات | نوافذ | تصدير |
|--------|:-----:|:----:|:-----:|:------:|:-----:|:-----:|
| الطلبات | ✅ متعدد الأصناف | ✅ | ✅ | ❌ | تفاصيل، إلغاء C1، هدية | CSV |
| المشتريات | ✅ | ✅ | ✅ | ✅ 3 | تفاصيل، دفع مورد، **عكس C5** (refund/credit — D-10) | CSV |
| المصاريف | ✅ | ✅ | ✅ | ✅ 1 | تفاصيل | CSV |
| التوصيلات | ✅ | ✅ | ✅ | ❌ | VIN، إلغاء | CSV |
| مهام السائق | ❌ | بطاقات | ✅ حالة | ✅ 3 | تأكيد | ❌ |
| تحضير | ❌ | بطاقات | ✅ حالة | ✅ 3 | تأكيد تحضير | ❌ |
| الفواتير | ❌ | ✅ | ✅ | ❌ | تفاصيل | PDF |
| الصندوق | ✅ تحويل | ✅ حركات | ✅ | ✅ أرصدة | تسوية يومية | CSV |
| التسويات | ✅ | ✅ | ❌ | شريط جانبي | تفاصيل | CSV |
| توزيع الأرباح | ✅ متعدد | ✅ | ❌ | حوض الفترة | ❌ | CSV |
| المخزون | ❌ | ✅ | ✅ | ✅ 3 | تفاصيل | CSV |
| صفحة منتج | ✅ تعديل | صور | ❌ | معلومات | رفع صور | PDF كتالوج |
| العملاء | ✅ | ✅ | ✅ | ✅ 2 | ❌ | CSV |
| تفاصيل عميل | ✅ دفع | ✅ tabs | ❌ | ملخص | ❌ | CSV |
| الموردين | ✅ | ✅ | ✅ | ❌ | ❌ | CSV |
| الجرد | ✅ عدّ | ✅ | ✅ تاريخ | ❌ | ❌ | CSV |
| عمولتي | ❌ | ✅ | ✅ | ✅ 4 | ❌ | CSV |
| المستخدمين | ✅ 3 tabs | ✅ | ❌ | ❌ | تأكيد | CSV |
| الإعدادات | ✅ | ❌ | ❌ | ❌ | نسخ احتياطي | ❌ |
| Dashboard | ❌ | ✅ عدة | ✅ تاريخ | ✅ KPI | ❌ | CSV |
