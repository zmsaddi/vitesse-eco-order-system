# معالجة الأخطاء — Error Handling

> **رقم العنصر**: #31 | **المحور**: و | **الحالة**: مواصفات نهائية

---

## الاستراتيجية

### Arabic-prefix convention

كل دالة/middleware تُرجع خطأ تعتمد هذه القاعدة:

- **الرسالة تبدأ بحرف عربي (U+0600–U+06FF)** → آمنة للعرض، تُمرَّر كما هي للـ client.
- **غير ذلك** → تقنية؛ تُسجَّل في stderr وتُخفى خلف fallback عام `"حدث خطأ ما. حاول مرة أخرى."`.

```ts
// src/lib/api-errors.ts
export function apiError(err: unknown, fallback: string, status = 400): NextResponse {
  const msg = err instanceof Error ? err.message : String(err);
  const safe = /^[\u0600-\u06FF]/.test(msg);
  if (!safe) console.error('[api-error]', msg);
  return NextResponse.json(
    { error: safe ? msg : fallback, code: (err as any)?.code },
    { status }
  );
}
```

### Typed error classes (D-50 — User-friendly messages)

الـ BusinessRuleError يحمل **حقلين**: `userMessage` (عربي، يُعرض للمستخدم النهائي) و `developerMessage` (إنجليزي، يُسجَّل في logs).

```ts
// src/lib/errors.ts
export class BusinessRuleError extends Error {
  constructor(
    public userMessage: string,          // D-50: عربي، user-facing
    public code: string,
    public status = 400,
    public developerMessage?: string     // D-50: technical context للـ logs
  ) {
    super(userMessage);
  }
}
export class AuthError extends BusinessRuleError {
  constructor(msg: string = 'غير مصرح — سجّل دخولك مجدداً') {
    super(msg, 'UNAUTHORIZED', 401);
  }
}
export class PermissionError extends BusinessRuleError {
  constructor(msg: string = 'ليس لديك صلاحية لتنفيذ هذا الإجراء') {
    super(msg, 'FORBIDDEN', 403);
  }
}
export class NotFoundError extends BusinessRuleError {
  constructor(entity: string) { super(`${entity} غير موجود`, 'NOT_FOUND', 404); }
}
export class AlreadyCancelledError extends BusinessRuleError {
  constructor() { super('الطلب مُلغى مسبقاً', 'ALREADY_CANCELLED', 409); }
}
export class BonusChoiceRequiredError extends BusinessRuleError {
  constructor(public preview: any) { super('اختيار مصير العمولات مطلوب', 'BONUS_CHOICE_REQUIRED', 428); }
}
export class SettledBonusBlockError extends BusinessRuleError {
  constructor(role: string) { super(`عمولة ${role} مصروفة مسبقاً — اختر إلغاء كدين`, `SETTLED_BONUS_${role.toUpperCase()}`, 409); }
}
export class CustodyCapExceededError extends BusinessRuleError {
  constructor() { super('تجاوزت السقف النقدي. سلِّم الأموال لمديرك أولاً', 'CUSTODY_CAP_EXCEEDED', 409); }
}
```

---

## HTTP Status Codes

| الكود | المعنى | استخدام |
|-------|--------|--------|
| 200 | نجاح | GET, PUT, DELETE |
| 201 | تم الإنشاء | POST |
| 400 | خطأ في المدخلات | Zod validation fail |
| 401 | غير مصادَق | لا session |
| 403 | ممنوع | الدور لا يملك صلاحية |
| 404 | غير موجود | كيان غير موجود |
| 409 | تعارض | oversell، دفع زائد، إلغاء مكرَّر |
| 412 | شرط مسبق مفقود | ميزة مطلوبة لم تُشحن بعد (مثلاً: `D35_READINESS_INCOMPLETE`) |
| 413 | حجم كبير | audio > 10 MB، image > 5 MB |
| 428 | شرط مسبق مطلوب | cancel بلا bonusActions + bonuses exist |
| 429 | تجاوز الحد | voice rate limit |
| 500 | خطأ داخلي | غير متوقَّع (يُسجَّل في Sentry/stderr) |

---

## صيغة الاستجابة

```json
// نجاح
{
  "data": { ... },
  "meta": { "page": 1, "total": 100 }
}

// خطأ
{
  "error": "الرسالة بالعربية",
  "code": "BONUS_CHOICE_REQUIRED",
  "preview": { ... }   // اختياري حسب نوع الخطأ
}
```

---

## Error codes مرجعية (D-50 — user-facing vs developer)

الجدول يُميِّز بين **userMessage** (عربي، lossless للعرض) و **developerMessage** (English، للـ logs فقط):

| Code | userMessage (عربي، يُعرض) | developerMessage (English، logs) | الحالة |
|------|---------------------------|------------------------------------|--------|
| `UNAUTHORIZED` | غير مصرح — سجّل دخولك مجدداً | Session expired or missing | 401 |
| `FORBIDDEN` | ليس لديك صلاحية لتنفيذ هذا الإجراء | Permission check failed for role={role} resource={res} action={act} | 403 |
| `NOT_FOUND` | {entity} غير موجود | Entity {entity_type} id={id} not found | 404 |
| `VALIDATION_FAILED` | البيانات المدخلة غير صحيحة. راجع الحقول المميَّزة | Zod validation failed: {zodIssues} | 400 |
| `INSUFFICIENT_STOCK` | الكمية المطلوبة ({req}) أكبر من المخزون المتاح ({avail}) | Stock check: product={id} req={req} avail={avail} | 409 |
| `OVERPAYMENT` | المبلغ ({paid}) أكبر من المتبقي ({remaining}) | Payment {paid} > remaining {remaining} on order {id} | 409 |
| `INCOMPLETE_CASH_PAYMENT` | الدفع بـ"{method}" يستوجب تسديد المتبقي كاملاً عند التسليم ({remaining}€) | BR-07 enforced in confirm-delivery: non-credit method with paid ≠ remaining | 400 |
| `NO_DRIVER_ASSIGNED` | لا يمكن المتابعة بلا سائق مُسند. أَسنِد سائقاً أولاً أو دع السائق يتابع بنفسه (BR-23) | BR-23 self-assign helper: delivery has null assigned_driver_id AND caller role ≠ 'driver' | 400 |
| `NOT_A_DRIVER` | المستخدم {username} ليس سائقاً | Delivery service resolveDriver: target user row has role ≠ 'driver' | 400 |
| `ALREADY_CANCELLED` | هذا الطلب مُلغى مسبقاً | Order {id} already in cancelled state | 409 |
| `ALREADY_PAID` | هذا الطلب مدفوع بالكامل | Payment sum matches total within tolerance | 409 |
| `BONUS_CHOICE_REQUIRED` | يجب اختيار مصير عمولة البائع والسائق قبل الإلغاء | Cancel dialog C1 incomplete: missing bonusActions | 428 |
| `SETTLED_BONUS_SELLER` | لا يمكن إلغاء علاوة البائع لأنها بحالة "{status}" | BR-18 cancel_unpaid refused: bonus row for seller already 'settled' | 409 |
| `SETTLED_BONUS_DRIVER` | لا يمكن إلغاء علاوة السائق لأنها بحالة "{status}" | BR-18 cancel_unpaid refused: bonus row for driver already 'settled' | 409 |
| `BONUS_NOT_SETTLED_FOR_DEBT` | لا يمكن تحويل علاوة {البائع\|السائق} إلى دَين قبل تسويتها — الحالة الحالية "{status}" | Phase 4.4 `applyBonusActionsOnCancel`: `cancel_as_debt` invoked on a role where ≥1 bonus row has `status !== 'settled'`. Zero side effects. | 409 |
| `DEBT_EXCEEDS_PAYOUT` | الديون المتراكمة تتجاوز مجموع العلاوات — لا يمكن الصرف | Phase 4.4 `performSettlementPayout`: `grossBonus + debtTotal < 0`. All-or-nothing consumption across every unapplied `type='debt'` row for the (userId, role). Zero side effects. | 409 |
| `INVALID_SETTLEMENT_BONUS_SET` | قائمة العلاوات غير صحيحة — الحالة/المالك/الدور غير متجانس (أو معرف غير موجود) | Phase 4.4 `performSettlementPayout`: `bonusIds` includes ids that are missing, cross-user, cross-role, already-settled, retained, or soft-deleted. Also fires when a concurrent settlement already linked the bonus rows. | 400 |
| `SETTLEMENT_SOURCE_ACCOUNT_INVALID` | حساب المصدر غير مسموح للدفع — يُسمح فقط بـ main_cash أو main_bank. أو: طريقة الدفع لا تطابق حساب المصدر | Phase 4.4 `performSettlementPayout` / `performRewardPayout`: `fromAccount.type ∉ {main_cash, main_bank}` OR paymentMethod invariant violated (main_cash ↔ كاش, main_bank ↔ بنك). One umbrella code for both invariants. | 409 |
| `D35_READINESS_INCOMPLETE` | لا يمكن إصدار فاتورة: مذكرات D-35 الإلزامية ناقصة ({keys}). راجع الإعدادات | confirm-delivery pre-check: one or more of D35_REQUIRED_SETTINGS is missing/empty/placeholder | 412 |
| `INVOICE_NO_ITEMS` | لا يمكن إصدار فاتورة لطلب بلا أصناف | issueInvoiceInTx: order_items empty (should be unreachable — defense-in-depth) | 409 |
| `INVOICE_TOTAL_MISMATCH` | اختلال مجاميع الفاتورة | issueInvoiceInTx: sum(line.line_total) ≠ orders.total_amount (defense-in-depth) | 500 |
| `INVOICE_NOT_ISSUABLE_AVOIR` | لا يمكن إصدار Avoir لفاتورة بحالة "{status}" | Phase 4.5 `performIssueAvoir`: `parent.status !== 'مؤكد'` (e.g. ملغي). Zero side effects. | 409 |
| `AVOIR_ON_AVOIR_NOT_ALLOWED` | لا يمكن إصدار Avoir على Avoir آخر | Phase 4.5 `performIssueAvoir`: `parent.avoirOfId !== null`. Single-level reversal only. | 409 |
| `INVALID_AVOIR_LINE_SET` | قائمة سطور الـ Avoir غير صحيحة (lineId غير منتمٍ للفاتورة أو مكرَّر) | Phase 4.5 `performIssueAvoir`: invoiceLineId from another invoice, duplicate id, or defence `computed totalTtc >= 0`. | 400 |
| `AVOIR_QTY_EXCEEDS_REMAINING` | الكمية المطلوبة تتجاوز المتبقي القابل للاسترداد على الصنف ({lineNumber}): المتاح {remaining} | Phase 4.5 `performIssueAvoir` under FOR UPDATE: cumulative credited quantity across prior avoirs for this parent line + new request > parent line quantity (tolerance 0.005). | 409 |
| `VIN_REQUIRED` | رقم VIN مطلوب لهذه الفئة ({category}) | vin_required_categories includes {cat}, vin field empty | 400 |
| `DISCOUNT_OVER_LIMIT` | لا يمكنك منح خصم يتجاوز {limit}% ({req}% مطلوب) | role={role} discount={req}% > max={limit}% | 403 |
| `PRICE_BELOW_COST` | السعر أقل من سعر الشراء — غير مقبول | sell_price={sp} < buy_price={bp} for product={id} | 400 |
| `DUPLICATE_USERNAME` | اسم المستخدم موجود مسبقاً. اختر اسماً آخر | UNIQUE constraint violation users.username={u} | 400 |
| `VOICE_RATE_LIMIT` | وصلت الحد الأقصى للإدخال الصوتي ({n}/دقيقة). انتظر قليلاً ثم حاول مجدداً | User={u} exceeded voice_rate_limit_per_min={n} | 429 |
| `VOICE_BLACKLISTED` | لم أفهم التسجيل. حاول بصوت أوضح | Transcript matched BLACKLIST_PHRASES | 400 |
| `AMBIGUOUS_ENTITY` | يوجد عدة احتمالات لـ "{name}". اختر من القائمة | Resolver returned 2+ candidates for {entity_type} | 400 |
| `IDEMPOTENCY_KEY_REQUIRED` | خطأ فني — تواصل مع الدعم إن تكرر | Endpoint requires Idempotency-Key header (D-16/D-79) | 400 |
| `IDEMPOTENCY_KEY_MISMATCH` | تم إرسال نفس الطلب مرتين. افتح الصفحة مجدداً وأعد المحاولة | key={k} endpoint={e} request_hash mismatch (D-79) | 409 |
| `IDEMPOTENCY_KEY_OWNER_MISMATCH` | خطأ فني — تواصل مع الدعم إن تكرر | key={k} endpoint={e} already used by different username (D-79) | 409 |
| `VIN_DUPLICATE` | رقم VIN ({vin}) مكرَّر داخل نفس الطلب | Same VIN used twice on different items in a single POST (Phase 3.1.1) | 400 |
| `VIN_DUPLICATE` | رقم VIN ({vin}) مُستخدَم على طلب آخر نشط | VIN {vin} found on active order_item {id} (order not cancelled/deleted) — Phase 3.1.1 | 409 |
| `SKU_LIMIT_REACHED` | وصلت الحد الأقصى للمنتجات النشطة ({limit}). عطِّل منتجاً قبل إضافة جديد | COUNT(products WHERE active=true) >= {limit} | 400 |
| `MAX_IMAGES_REACHED` | لا يمكن إضافة أكثر من {max} صور لكل منتج | product_images count for product_id={id} >= {max} | 400 |
| `CUSTODY_CAP_EXCEEDED` | تجاوزت السقف النقدي. سلِّم الأموال لمديرك أولاً | BR-55b enforced inside confirm-delivery bridge: driver_custody.balance + paidAmount > settings.driver_custody_cap_eur | 409 |
| `INSUFFICIENT_CUSTODY` | لا يمكن تسليم مبلغ يتجاوز رصيد العهدة | POST /api/v1/treasury/handover: amount > driver_custody.balance under FOR UPDATE | 409 |
| `CUSTODY_DRIVER_UNLINKED` | لا يمكن تنفيذ عملية الصندوق: السائق غير مرتبط بمدير | confirm-delivery bridge OR handover: drv.manager_id IS NULL OR driver_custody missing | 409 |
| `DRIVER_MANAGER_REQUIRED` | السائقون النشطون يجب أن يكونوا مرتبطين بمدير | users createUser/updateUser: role='driver' AND active=true AND manager_id IS NULL | 400 |
| `INVALID_MANAGER` | المستخدم المحدد ليس مديراً نشطاً | users service validateManagerLink: manager_id references user not (role='manager' AND active) | 400 |
| `MANAGER_BOX_MISSING` | لا يوجد صندوق للمدير المقصود | Handover or driver-custody auto-wiring: manager_box for the target manager not found (defense-in-depth — bootstrap should always create it) | 409 |
| `MAIN_CASH_MISSING` | الصندوق الرئيسي (main_cash) غير مُهيَّأ — شغِّل /api/init أولاً | Phase 4.2.1 `ensureManagerBox`: no row with `type='main_cash'` in treasury_accounts (defense-in-depth — should be unreachable after /api/init) | 500 |
| `INVALID_TRANSFER_ROUTE` | المسار غير مسموح: {from.type} → {to.type} | Phase 4.3 `performTransfer`: (fromType, toType) pair outside the 4-route allowlist (funding / manager_settlement / bank_deposit / bank_withdrawal) — server-inferred category cannot be resolved | 409 |
| `INSUFFICIENT_BALANCE` | الرصيد ({balance}€) أقل من مبلغ التحويل ({amount}€) | Phase 4.3 `performTransfer`: source account balance < amount under FOR UPDATE (0.005€ tolerance) | 409 |
| `TREASURY_ACCOUNT_MISSING` | حساب الصندوق غير موجود | Phase 4.3 `performTransfer` / `performReconcile`: `fromAccountId` / `toAccountId` / `accountId` resolves to no row in treasury_accounts | 409 |
| `TREASURY_EXPECTED_COMPUTATION_FAILED` | فشل حساب الرصيد المتوقع من حركات الصندوق | Phase 4.3 `computeExpectedBalance`: SUM over treasury_movements returns a non-finite value (defense-in-depth — should be unreachable unless amount column corrupted) | 500 |
| `RECONCILE_NOT_OWNER` | لا يمكنك مصالحة صندوق ليس لك | Phase 4.3.1 `performReconcile`: caller role='manager' AND (account.type ≠ 'manager_box' OR account.owner_user_id ≠ claims.userId). Dedicated code so the wire contract is distinguishable from a generic `FORBIDDEN`. | 403 |
| `VALIDATION_FAILED` (money precision — Phase 4.3.1 / 4.3.2) | المبلغ يجب أن يكون بدقة سنتين (2 decimals max) / الرصيد يجب أن يكون بدقة سنتين / المبلغ المدفوع يجب أن يكون بدقة سنتين | Any money field on a money-mutating endpoint carries more than 2 decimal places (e.g. 0.004, 0.005, 10.004). Covered fields — Phase 4.3.1: Transfer `amount`, Reconcile `actualBalance`. Phase 4.3.2: Handover `amount`, Confirm-Delivery `paidAmount`. Rejected at the Zod refine via shared `isTwoDecimalPrecise` predicate in `src/lib/money.ts`; service-level defense-in-depth also rejects `round2(value) < 0.01` on transfer / handover / confirm-delivery so no zero-value movement or payment row can be inserted by a direct service call that bypasses Zod. | 400 |
| `OVERLAPPING_PERIOD` | فترة التوزيع متداخلة مع فترة موجودة | profit_distribution_groups overlap detected | 409 |
| `CRON_UNAUTHORIZED` | **(لا يُعرض — server-only)** | CRON_SECRET mismatch or missing | 401 |

**القاعدة (D-50)**: الرسائل العربية تحتوي **إرشاد الحل** (ماذا يفعل المستخدم الآن)، ليس فقط وصف المشكلة. أمثلة:
- ❌ "مفتاح Idempotency يتكرر" → ✓ "تم إرسال نفس الطلب مرتين. افتح الصفحة مجدداً وأعد المحاولة."
- ❌ "SKU_LIMIT_REACHED" → ✓ "وصلت الحد الأقصى للمنتجات النشطة. عطِّل منتجاً قبل إضافة جديد."
- ❌ "CRON_UNAUTHORIZED" → **لا تظهر أبداً للمستخدم**.

---

## Toast في الواجهة

| النوع | اللون | المدة | الاستخدام |
|-------|------|-------|----------|
| نجاح | أخضر | 3s | بعد POST/PUT/DELETE ناجح |
| خطأ | أحمر | 5s | code في الرد غير فارغ |
| تحذير | برتقالي | 5s | warnings في الرد |
| معلومة | أزرق | 3s | إشعارات عامة |

الـ toast يُعرض عبر `sonner` (مدمج مع shadcn/ui).

---

## Logging

- **Client**: `console.error` على الأخطاء غير المتوقَّعة فقط.
- **Server**: `console.error('[context]', msg)` على كل غير آمن.
- **Production**: Sentry integration (اختياري على الـ free tier — Phase 6).
- **Database errors**: تُلتقط في wrapper، لا تُكشَف أبداً للمستخدم.

---

## Retry strategy

- **TanStack Query**: retry 1x على 5xx فقط. لا retry على 4xx (بما فيها 429).
- **Server-side DB operations**: لا auto-retry؛ الـ transaction rollback + surface error.
- **Voice API**: عند `groq_api_error` (500 من Groq) → رسالة "الخدمة الصوتية متوقفة مؤقتاً" + fallback للإدخال اليدوي.

---

## UX conventions

1. **لا alerts modal بلا سبب**. استخدم toast للأخطاء المؤقتة، ConfirmDialog للإجراءات الحرجة فقط.
2. **الأخطاء الحرجة (إلغاء، حذف، تسوية)** يسبقها dialog تأكيد مع نص صريح.
3. **errors in form fields** تُعرض تحت الحقل مباشرة (inline) — لا toast.
4. **warnings** لا تمنع الحفظ لكنها تظهر دائماً في modal أو banner مرئي.
