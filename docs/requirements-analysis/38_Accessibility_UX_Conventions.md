# Accessibility + UX Conventions

> **رقم العنصر**: #38 | **المحور**: د | **الحالة**: مواصفات نهائية (Phase 0c)
> **القرارات الحاكمة**: D-46 (C1 modes)، D-47 (Voice SmartSelect)، D-48 (Empty states)، D-49 (Onboarding)، D-50 (Error messages)، D-51 (Accessibility budget)، D-52 (Commission preview)، D-64 (Toast duration)، D-65 (Mobile stepper)

---

## 1. Accessibility Budget (D-51)

### Zero AA Violations في CI

```yaml
# .github/workflows/ci.yml (في Phase 5)
- name: axe-core
  run: npx playwright test --grep @a11y
# في tests/e2e/accessibility.spec.ts:
# await expect(page).toPassAxe({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] });
```

### النقاط الحرجة المُختبَرة

| البند | القياس | الحد الأدنى |
|-------|--------|-------------|
| Touch targets | min-size | 44 × 44 px (WCAG 2.5.5) |
| Color contrast | contrast-ratio | 4.5:1 normal، 3:1 large (WCAG 1.4.3) |
| Keyboard navigation | tab-order + focus-visible | 100% interactive elements |
| Screen reader | aria-label + aria-live | كل button + toast |
| Focus trap | Dialog + Command Palette | إلزامي |
| Form validation | aria-invalid + aria-describedby | إلزامي على إخفاق |
| Error announcement | aria-live='assertive' | toasts error |
| Success announcement | aria-live='polite' | toasts success |
| Skip links | "تخطَّ إلى المحتوى" | تلقائي في AppLayout |

### Cairo Contrast Tokens

تُعرَّف في `tailwind.config.ts` حتى قبل dark mode Phase 5:

```ts
colors: {
  foreground: 'hsl(var(--foreground))',
  background: 'hsl(var(--background))',
  muted: 'hsl(var(--muted))',
  'muted-foreground': 'hsl(var(--muted-foreground))',
  // ...
}
```

مع CSS variables لـ light:
- `--foreground: 222 47% 11%` (near-black)
- `--background: 0 0% 100%` (white)
- `--muted: 210 40% 96%`
- contrast نص/خلفية = 16.8:1 ✅

ولـ dark (قيم مُختبَرة لـ Cairo):
- `--foreground: 210 40% 98%`
- `--background: 222 47% 11%`
- contrast = 15.2:1 ✅

---

## 2. Empty States Matrix (D-48)

كل `<DataTable>` يأخذ prop `emptyState={title, description, action?}` **إلزامي**. ESLint rule يمنع DataTable بلا `emptyState`.

### Matrix 25 صفحة × 6 أدوار (عيِّنات — القائمة الكاملة في Phase 2)

| الصفحة | الدور | عنوان | شرح | CTA |
|--------|------|------|-----|-----|
| `/orders` | seller | "لم تُنشئ أي طلب بعد" | "ابدأ ببيعتك الأولى" | "طلب جديد" |
| `/orders` | pm/gm | "لا طلبات في النظام" | "انتظر seller ينشئ طلبات" | — |
| `/preparation` | stock_keeper | "لا طلبات قيد التحضير حالياً" | "كل الطلبات جاهزة. عمل ممتاز!" | — |
| `/driver-tasks` | driver | "لا مهام اليوم" | "ستظهر هنا عند تعيين توصيل" | — |
| `/my-bonus` | seller/driver | "لا عمولات بعد" | "تُسجَّل عند تأكيد التسليم" | — |
| `/stock` | stock_keeper | "لا منتجات في المخزون" | "أضف أول منتج" | "منتج جديد" |
| `/notifications` | all | "لا إشعارات جديدة" | "ستظهر هنا عند حدوث شيء" | — |
| `/clients` | manager | "لا عملاء بعد" | "يُنشَأون تلقائياً عند البيع" | "عميل جديد" |
| `/invoices` | all | "لا فواتير" | "تُنشَأ تلقائياً عند التسليم" | — |
| `/treasury` | manager | "الصندوق فارغ" | "ستظهر حركات عند التحصيل" | — |
| `/settlements` | pm | "لا تسويات معلَّقة" | "كل العمولات مسواة" | — |
| `/distributions` | pm/gm | "لم توزَّع أرباح بعد" | "اختر فترة للتوزيع" | "توزيع جديد" |
| `/inventory` | stock_keeper | "لا جرد لهذا الشهر" | "ابدأ جرداً جديداً" | "بدء جرد" |
| `/activity` | pm | "لا نشاط" | "سيظهر تاريخ كل العمليات" | — |
| `/voice-search-results` | all | "لم يُفهَم شيء" | "جرب قول الجملة بشكل مختلف" | "سجل مجدداً" |

الجدول الكامل (150 خلية) يُولَّد في Phase 2 مع اختبار usability.

---

## 3. Onboarding Flow (D-49)

### Schema Change

```sql
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ NULL;
```

### Welcome Modal (mounted مرة واحدة)

شرط العرض: `session.user.onboarded_at IS NULL`.

### Checklist لكل دور

**seller**:
1. ✅ تعلَّمت إنشاء طلب (انقر "طلب جديد" في sidebar)
2. ✅ تعرَّفت على زر الصوت 🎙️ (اضغط لتجربة)
3. ✅ رأيت عمولتي المتوقعة في نموذج الطلب
4. ✅ عرفت حد الخصم المسموح (5%)
5. ✅ أكمل المهام → "بدء العمل"

**driver**:
1. ✅ تعلَّمت تأكيد توصيل + VIN
2. ✅ تعرَّفت على "تسليم الأموال لمديري"
3. ✅ رأيت عهدتي النقدية الحالية
4. ✅ عرفت السقف 2000€
5. ✅ "بدء العمل"

**stock_keeper**:
1. ✅ تعلَّمت "ابدأ التحضير" لطلب محجوز
2. ✅ تعلَّمت "جاهز" بعد تحضير الأصناف
3. ✅ تعرَّفت على التنبيه بمخزون منخفض
4. ✅ "بدء العمل"

**manager**:
1. ✅ تعرَّفت على صندوقي الفرعي
2. ✅ تعلَّمت التسوية اليومية
3. ✅ تعلَّمت استلام أموال السائقين
4. ✅ "بدء العمل"

**pm/gm**:
1. ✅ تعرَّفت على لوحة التحكم
2. ✅ تعلَّمت توزيع الأرباح
3. ✅ تعرَّفت على سجل النشاطات
4. ✅ راجعت الصلاحيات (PM only)
5. ✅ "بدء العمل"

### Tooltips سياقية

- `localStorage['vitesse-tooltip-{id}-dismissed'] = true` لكل tooltip مُغلَق.
- حد أقصى 5 tooltips في أول أسبوع.
- زر "إعادة التعلُّم" في `/settings/profile`.

---

## 4. User-Friendly Error Messages (D-50)

### Pattern: Typed Error Class

```ts
export class BusinessRuleError extends Error {
  constructor(
    public userMessage: string,       // Arabic، for UI
    public code: string,              // machine-readable
    public status: number = 400,
    public developerMessage?: string, // English، for logs
    public extraContext?: Record<string, unknown>
  ) {
    super(developerMessage ?? userMessage);
  }
}
```

### Error Message Dictionary

| Code | userMessage (Arabic) | developerMessage (English, logs) |
|------|---------------------|----------------------------------|
| `UNAUTHORIZED` | غير مصرح | Session missing or expired |
| `FORBIDDEN` | صلاحياتك لا تسمح بهذا الإجراء | Role {role} lacks permission {resource}:{action} |
| `NOT_FOUND` | {entity} غير موجود | Entity {entity}#{id} not found |
| `VALIDATION_FAILED` | تحقّق من الحقول المميَّزة بالأحمر | Zod validation: {field}: {reason} |
| `INSUFFICIENT_STOCK` | الكمية المطلوبة أكبر من المخزون المتاح | Product {name}: requested={qty}, available={stock} |
| `OVERPAYMENT` | المبلغ أكبر من المتبقي — تحقق من الأرقام | Payment {amount} > remaining {remaining} |
| `ALREADY_CANCELLED` | هذا الطلب مُلغى مسبقاً — لا يمكن إلغاؤه مرتين | Idempotency: order already cancelled |
| `BONUS_CHOICE_REQUIRED` | اختر ماذا يحدث للعمولات قبل الإلغاء | BonusActions missing with active bonuses |
| `SETTLED_BONUS_SELLER` | عمولة البائع مصروفة — اختر "إلغاء كدين" بدلاً من "حذف" | Seller bonus settled, only cancel_as_debt allowed |
| `VIN_REQUIRED` | رقم VIN مطلوب للدراجات | Category {cat} requires VIN per settings |
| `VIN_DUPLICATE` | هذا الـ VIN مستخدم على طلب آخر نشط | VIN {vin} exists on order_items active row |
| `DISCOUNT_OVER_LIMIT` | الخصم يتجاوز الحد المسموح لدورك | Role {role} max discount {max}%, given {given}% |
| `PRICE_BELOW_COST` (seller) | غير مقبول | Seller attempt price {price} < buy_price {cost} |
| `PRICE_BELOW_COST` (manager+) | السعر {price} أقل من التكلفة {cost} | Same |
| `DUPLICATE_USERNAME` | اسم المستخدم موجود مسبقاً — اختر اسماً آخر | UNIQUE violation on users.username |
| `VOICE_RATE_LIMIT` | تجاوزت حد الإدخال الصوتي — انتظر دقيقة قبل المحاولة | Rate: 10/60s window exceeded |
| `VOICE_BLACKLISTED` | النص غير مفهوم — حاول مرة أخرى | Blacklist matched: {phrase} |
| `AMBIGUOUS_ENTITY` | عثرت على عدة نتائج — اختر من القائمة | Resolver top 3: {candidates} |
| `IDEMPOTENCY_KEY_REQUIRED` | خطأ داخلي. أعد فتح الصفحة | Dev: endpoint requires header Idempotency-Key |
| `IDEMPOTENCY_KEY_CONFLICT` | تم إرسال نفس الطلب مرتين. أعد تحميل الصفحة | Dev: key collision with different body |
| `SKU_LIMIT_REACHED` | وصلت الحد الأقصى للمنتجات النشطة. عطِّل منتجاً قبل إضافة جديد | sku_limit={n}, active count={n} |
| `MAX_IMAGES_REACHED` | الحد الأقصى 3 صور لكل منتج | Product {id} has 3 images |
| `CUSTODY_CAP_EXCEEDED` | تجاوزت سقف العهدة. سلِّم الأموال لمديرك أولاً | Driver custody {balance}+{new} > cap {cap} |
| `CRON_UNAUTHORIZED` | — (server-only، لا يظهر للمستخدم) | Invalid CRON_SECRET |
| `OVERLAPPING_PERIOD` | هذه الفترة تتقاطع مع توزيع سابق | profit_distribution_groups overlap |

---

## 5. Number + Date Formatting (from U-H09)

### UI (Arabic interface)

- **Money**: أرقام لاتينية بنقطة: `1234.56 €` — فصل فواصل لا يُستخدم (للوضوح).
- **Date**: `yyyy-MM-dd` في forms، `d MMM yyyy` في عرض (2026-04-19 → "19 أبريل 2026").
- **Time**: `HH:mm` (24-hour).
- **Timezone**: `Europe/Paris` على كل UI (حتى لو المستخدم في timezone أخرى).

### Invoice PDF (French)

- **Money**: `1 234,56 €` (espace thousand separator + virgule decimal).
- **Date**: `19 avril 2026`.
- **VAT**: `20,00 %`.

### CSV Export

- **Delimiter**: `;` (فاصلة منقوطة — Excel FR friendly).
- **Decimal**: `.` (point — compatibility).
- **Date**: ISO `yyyy-MM-dd` (unambiguous).
- **Encoding**: UTF-8 with BOM (`\uFEFF`) for Excel proper Arabic rendering.

---

## 6. Toast Durations (D-64)

```ts
// src/lib/toast.ts
export function showToast(message: string, type: 'success'|'error'|'warning'|'info', options?) {
  const duration = options?.duration ?? Math.max(
    3000,
    message.length * 50, // ~50ms per character
    type === 'error' ? 5000 : 3000 // minimum for errors
  );

  // errors with code = persistent (require dismiss)
  if (type === 'error' && options?.code) {
    duration = Infinity;
  }

  toast[type](message, { duration, ariaLive: type==='error' ? 'assertive' : 'polite' });
}
```

---

## 7. Mobile Order Form Stepper (D-65)

`<768px`:

```
┌─────────────────────────┐
│ 1. العميل   2. الأصناف   │
│ ✓           [نشط]      │
│             3. الدفع    │
├─────────────────────────┤
│                         │
│    [Form Step 2]        │
│                         │
│    [Item cards]         │
│    [+ إضافة صنف]         │
│                         │
│                         │
├─────────────────────────┤  ← sticky footer
│ المجموع: 1,234.56 €     │
│ [رجوع]      [التالي →]  │
└─────────────────────────┘
```

- Step 1: client (SmartSelect + phone auto-fill).
- Step 2: items (collapsible cards مع quick-edit).
- Step 3: payment_method + down_payment + notes + confirm.
- Sticky total footer دائم.
- swipe أفقي بين steps (اختياري).

`≥768px`: single-scroll كما هو الحالي.

---

## 8. Commission Preview for Seller (D-52)

في `<OrderItemForm>`:

```tsx
{session.user.role === 'seller' && (
  <div className="text-sm text-muted-foreground">
    عمولتي المتوقعة: <strong>{formatCurrency(calcPreviewCommission(item, snapshot))}</strong>
  </div>
)}
```

حيث `calcPreviewCommission` يستخدم نفس صيغة `calculateBonusInTx` (5_commission_formula) من `commission_rule_snapshot` المُلتقَط.

إجمالي العمولة في footer:
```tsx
إجمالي الطلب: 1,234.56 €
عمولتي المتوقعة: 45.00 € (من seller فقط)
```

---

## 9. Voice Confirm Flow (D-47)

حقول VoiceConfirm = same components النماذج اليدوية:

- `client_name` = `<SmartSelectClient>` (نفس المستخدم في order form).
- `item` = `<SmartSelectProduct>` — **ليس text input**. يعرض name_en + name_ar إن وُجد. زر "+ منتج جديد" في القائمة للـ fallback.
- `supplier` = `<SmartSelectSupplier>`.
- `category` = `<Select>` من enum ثابت.
- `payment_type` = `<Select>`.
- الأرقام = `<NumberInput>` مع parsing إعدادي للفاصلة العربية.

---

## 10. Keyboard Shortcuts (U-H08)

- `Esc`: close Dialog / cancel.
- `Enter`: confirm (في forms غير destructive).
- `Space`: toggle checkbox / activate button عند focus.
- `Tab` / `Shift+Tab`: navigate focus (احترام RTL — Tab يذهب يسار في RTL).
- `Ctrl+K` / `Cmd+K`: Command Palette (fallback button في Topbar).
- `?`: فتح modal يعرض كل shortcuts.

**لا J/K/E/Delete** — تسبب RTL confusion. Arrow keys كافية للـ navigation.

---

## 11. Polling Feedback (U-H04)

- **Silent fetch**: `isFetching` بلا UI (بدون spinner).
- **Bell badge**: animation `pulse` خفيف عند تغيُّر count فقط.
- **Timestamp**: "آخر تحديث: منذ 12 ثانية" في تذييل كل DataTable (قابل للطي).

---

## 12. Notification click_targets (U-M10)

| Notification Type | click_target |
|-------------------|--------------|
| طلب جديد | `/orders/{id}` |
| طلب جاهز للتوصيل | `/deliveries/{id}` |
| دفعة مستلمة | `/orders/{order_id}` |
| مخزون منخفض | `/stock?low=true&product={id}` |
| مهمة جديدة | `/driver-tasks/{id}` |
| عمولة جديدة | `/my-bonus` |
| تسوية | `/my-bonus?settlement={id}` |
| طلب ملغي | `/orders/{id}` |
| سائق سلَّم أموال | `/treasury?handover={id}` |
| هدايا متاحة | `/orders/new?gift_hint=true` |
| دفعة متأخرة | `/orders/{order_id}#payments` |
| reconciliation | `/treasury?tab=reconcile` |
