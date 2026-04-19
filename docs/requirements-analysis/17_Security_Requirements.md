# متطلبات الأمان — Security Requirements

> **رقم العنصر**: #17 | **المحور**: ج | **الحالة**: مواصفات نهائية

---

## المصادقة (Authentication)

| البند | التفصيل |
|-------|---------|
| المكتبة | Auth.js v5 (يحل محل NextAuth.js v4) |
| الاستراتيجية | JWT (CredentialsProvider) |
| التشفير | **Argon2id** عبر `@node-rs/argon2` — `m=64MB, t=3, p=4` (D-40). Fallback: bcrypt 14 rounds إن native binding فشل على Vercel. |
| محتوى Token | id, username, name, role |
| **SessionClaims abstraction (D-67)** | كل business route handler يستدعي `getSessionClaims(request)` من `src/lib/session-claims.ts`، **ليس `auth()` مباشرة**. حالياً الـ implementation تستخرج claims من Auth.js session cookie؛ لاحقاً (Phase 5+) يُضاف bearer token branch للـ Android بدون تعديل أي route. الـ claims الموحَّد: `{ userId, username, role, name }`. |
| حماية المسارات | `src/middleware.ts` يقرأ role من JWT **فقط** (بلا DB — D-59). صلاحيات granular (`can(resource, action)`) في helpers داخل API routes بعد استخراج claims عبر `getSessionClaims(request)` (D-67). |
| التحقق النشط | `active=false` → رفض تسجيل الدخول |
| Session TTL | **idle 30 دقيقة + absolute 8 ساعات** (D-45). `updateAge: 30*60, maxAge: 8*3600`. Frontend: idle detection + warning modal قبل دقيقة من logout. |

### كلمة مرور admin الافتراضية (D-24)

- عند `/api/init` لأول مرة، النظام يُولِّد كلمة مرور **عشوائية** (24 حرف) ويطبعها في stdout **مرة واحدة فقط**:

```
=================================================
  ADMIN PASSWORD (save this — shown only once):
  Xk7@mP2qR9!vN3wL&yF8zC1t
=================================================
```

- تُخزَّن مشفَّرة بـ **Argon2id** في `users.password` (D-40).
- **لا قيمة hardcoded** (`admin123` مرفوض).
- المستخدم مطالَب بتغييرها عند أول دخول (UI يُجبره على تغيير كلمة المرور).

## التفويض (Authorization) — D-12

| البند | التفصيل |
|-------|---------|
| الدالة | `requireAuth(request, roles?)` في `src/lib/api-auth.ts` — تُستدعى في كل API route |
| الأدوار | 6: pm, gm, manager, seller, driver, stock_keeper |
| الصلاحيات DB-driven | جدول `permissions (role, resource, action, allowed)` |
| دالة التحقق | `can(role, resource, action)` مع cache محلّي 60s |
| Middleware | قراءة `session.user.role` + `can()` لكل resource |
| **PM vs GM** | PM هو الوحيد مع mutation access على `/permissions`. GM يرى (👁) لكن لا يعدِّل (D-12) |

## Rate Limiting

| البند | التفصيل |
|-------|---------|
| تسجيل الدخول | 5 محاولات/دقيقة/IP — soft block مع captcha بعدها (Phase 1) |
| الصوت | 10 طلبات/60s لكل user — مخزَّن في **جدول Neon `voice_rate_limits`** (D-14 + Report 1 M14)، ليس in-memory Map |
| APIs العامة | لا rate-limit صريح للـ MVP (الجمهور محدود)؛ يُضاف عند توسعة لاحقة |

## حماية قاعدة البيانات

| البند | التفصيل |
|-------|---------|
| Reset endpoint | يرفض في production. يتطلب `NODE_ENV != 'production'` + `ALLOW_DB_RESET='true'` + confirmation phrase `"احذف كل البيانات نهائيا"` |
| SSL | اتصال Neon `sslmode=require` افتراضياً |
| Transactions | `withTx()` حقيقي عبر Neon WebSocket Pool (D-05) |
| Locks | `FOR UPDATE` على المخزون + gift_pool + treasury_accounts + invoice_sequence |
| DELETE revocation | `REVOKE DELETE ON <financial_table> FROM app_role` (D-04) — طبقة دفاع إضافية فوق منع endpoint |

## Idempotency على العمليات الحرجة (D-16)

- header `Idempotency-Key` يُقبل على: `POST /api/orders`, `POST /api/orders/:id/cancel`, `POST /api/orders/:id/collect`, `POST /api/payments`, `POST /api/settlements`, `POST /api/distributions`.
- جدول `idempotency_keys` يخزِّن الـ response مع TTL 24h.
- نفس الـ key + نفس `request_hash` → يُعاد الـ response المخزَّن بدون re-execution.
- نفس الـ key + `request_hash` مختلف → 409 `IDEMPOTENCY_KEY_CONFLICT`.

## خصوصية البيانات (PII) — CNIL / GDPR

### PII masking في activity_log

| حقل | سياسة العرض |
|------|-------------|
| `email` | يُعرض كاملاً لـ PM/GM فقط. لغيرهم: `a***@example.com` |
| `phone` | يُعرض كاملاً لـ PM/GM فقط. لغيرهم: `+336******78` (آخر 2) |
| `address` | يُعرض كاملاً لـ PM/GM فقط. لغيرهم: اسم المدينة فقط |
| `password` | لا يُسجَّل نصاً في activity_log أبداً (CHECK على JSON: `password` key → قيمة تُستبدَل بـ `'[REDACTED]'` عند الإدراج) |
| `IBAN`/`BIC` | PM/GM only |
| `national_id` (إن وُجد لاحقاً) | PM/GM only |

تُطبَّق في طبقة العرض (UI + CSV export) بواسطة helper `maskPii(value, field, viewerRole)`.

### حق المحو GDPR Art. 17 vs BR-48

**التعارض**: GDPR يعطي العميل حق "المحو" لكن BR-48 يمنع الحذف الفعلي للسجلات المالية (مطلوبة لـ 10 سنوات commercial retention).

**الحل (pseudonymization)**:
- عند طلب عميل للمحو، يُنفَّذ `POST /api/clients/:id/anonymize` (PM-only):
  - `UPDATE clients SET name='ANON-'||id, latin_name='', phone='', email='', address='', description_ar='', notes='' WHERE id=:id`
  - السجلات المالية المرتبطة (orders/invoices/payments/bonuses) تبقى — تعرض الاسم المجهول `ANON-123`.
  - `activity_log` يُسجِّل الإجراء مع user_id فقط، لا قيم قديمة.
- النتيجة: السجلات المالية تظل قانونياً لكن **لا تحتوي PII**.

### Cookie consent

- Session cookie `next-auth.session-token` = strictly necessary (لا يحتاج consent بموجب CNIL/ePrivacy).
- لا tracking cookies خارجية في المشروع → لا banner مطلوب.

## نسخ احتياطي

- زر يدوي في `/settings` لـ PM/GM — تنزيل `pg_dump` مضغوط (BR-C4).
- Neon PITR: 7 أيام retention على الـ free tier (automatic).
- الاستعادة عبر Neon Console فقط (ليس من UI لمنع خطأ بشري).

## إدارة الأسرار

| البيئة | الطريقة |
|--------|---------|
| Development | `.env.local` (gitignored) |
| Production | Vercel Environment Variables |
| Rotation | NEXTAUTH_SECRET + GROQ_API_KEY كل 3 شهور (سياسة) |
| عدم تسريب | لا plaintext في الـ repo؛ لا logs تحتوي secrets |

## Audit + immutability

- `activity_log` rows **لا تُعدَّل** (trigger `reject_mutation()` يرفض UPDATE — D-58). يُسمح فقط INSERT + SELECT + DELETE (للـ cron retention فقط، مع logging خاص).
- `cancellations`, `price_history`, `treasury_movements` كذلك — append-only عبر نفس trigger (D-58).
- **Hash chain على الفواتير + invoice_lines + cancellations + activity_log** (D-37): كل row يحمل `prev_hash` + `row_hash = sha256(prev_hash || canonical_data)`. يُمكِّن كشف التلاعب العسكري بسلسلة.
- تفاصيل migration في `src/db/migrations/0001_immutable_audits.sql` (Phase 0).

## Legal Compliance Files (references)

- `docs/compliance/attestation_editeur.md` — attestation DGFiP loi anti-fraude TVA 2018 (D-37).
- `docs/compliance/fec_delegation.md` — خطاب تعهُّد expert-comptable بمسؤولية FEC (D-36).
- `docs/compliance/registre_traitements.md` — registre RGPD art. 30 (D-39).

## XSS / CSRF

- Next.js App Router يُعقِّم مخرجات JSX تلقائياً.
- Forms ترفع عبر `fetch` إلى `/api/v1/*` route handlers (D-66 + D-68). Server Actions مسموحة كـ thin wrappers تستدعي نفس route handler — **ممنوع** business logic/DB access داخلها. كل طلب يحمل `Origin`/`Sec-Fetch-Site` header validation + idempotency key حيث يلزم.
- RTL override chars (U+202E, U+202D) تُفلتَر من مدخلات الأسماء عبر Zod refine.

## HTTPS

Vercel يُفرض HTTPS تلقائياً. HSTS header مع `max-age=31536000; includeSubDomains`.
