# التكاملات الخارجية — Integrations

> **رقم العنصر**: #33 | **المحور**: ح | **الحالة**: مواصفات نهائية

---

## نظرة عامة

كل التكاملات الأساسية على الـ free tier. الهدف: تكلفة شهرية ~$0 لـ 20 مستخدم و < 500 MB بيانات.

| # | الخدمة | الدور | الطبقة المجانية | المرحلة |
|---|--------|------|-----------------|:-------:|
| 1 | **Neon Postgres** | قاعدة البيانات | 0.5 GB + 190h compute/شهر | 0 |
| 2 | **Vercel** | الاستضافة + Functions | Hobby (100 GB bandwidth، 60s timeout) | 0 |
| 3 | **Auth.js v5** | المصادقة | مفتوح المصدر، بدون خدمة | 1 |
| 4 | **Vercel Blob** | تخزين صور المنتجات | 500 MB + 1 GB bandwidth | 2 |
| 5 | **Groq API** | Whisper STT + Llama NLP | طبقة مجانية سخية | 5 |
| 6 | **Recharts** | رسوم بيانية | مكتبة client-side | 4 |
| 7 | **Vercel Cron** | Retention + reminders | مجاني على Hobby (2 cron/project) | 4, 5, 6 |

---

## التفاصيل لكل تكامل

### 1. Neon Postgres

- **الاتصال**: `@neondatabase/serverless` مع WebSocket Pool للكتابات، HTTP للقراءات.
- **Branching**: كل CI job يُنشئ branch ephemeral عبر API ثم يحذفه (`POST /api/v2/projects/:id/branches`).
- **PITR**: 7 أيام retention على الـ free tier — كافٍ لاسترداد الحوادث قصيرة المدى.
- **Monitoring**: Neon Console → Query history + slow query log.

### 2. Vercel Hobby

- **Runtime**: Node.js 24 LTS (D-15).
- **Function timeout**: 300s (الافتراضي الحديث، 2026+). أطول عملية PDF generation ~800ms.
- **Middleware**: Node.js runtime عند الحاجة لـ DB access (`export const runtime = 'nodejs'`).
- **Crons**: **2 maximum** على Hobby (D-23). مدموجان:
  - `/api/cron/daily` (03:00 Paris).
  - `/api/cron/hourly` (كل ساعة).
- **Environment variables**: 64 متغيراً كحد أقصى.
- **Fonts**: Cairo محلي (`next/font/local` من `public/fonts/cairo/`) — self-contained build (D-15).

### 3. Auth.js v5

- **الإصدار**: `next-auth@5.0.0-beta.x` (pin على إصدار محدَّد).
- **Strategy**: JWT مع `CredentialsProvider`.
- **Session (D-45)**: idle 30m + absolute 8h.
- **Password hashing (D-40)**: **Argon2id** عبر `@node-rs/argon2` (m=64MB, t=3, p=4). Fallback bcrypt 14 rounds إن native binding فشل على Vercel.
- **Middleware (D-59)**: JWT-only — لا DB في middleware. صلاحيات granular داخل API routes عبر `can()`.

### 4. Vercel Blob (D-25 + D-60)

- **Quota**: 500 MB على Hobby.
- **Deterministic Blob keys (D-60)**:
  ```
  products/{product_id}/slot-{0|1|2}.webp     (overwrite in place — 3 slots max)
  invoices/{invoice_id}.pdf                    (TTL 30d via cache headers)
  catalog/{language}.pdf                       (overwrite per render)
  backups/{YYYY-WW}.dump.gz.enc                (D-43 weekly, retention 12)
  ```
- **حدود صارمة**:
  - `sku_limit = 500` منتج نشط (في settings، enforced عند `POST /api/products`).
  - `max_images_per_product = 3`.
  - client-side compression عبر `browser-image-compression` إلى **300 KB max**.
  - حساب فعلي: 500 × 3 × 300 KB = ~450 MB + catalog PDFs (~30-50 MB) + backups (~600 MB — D-43) = **~1080 MB على Hobby 500 MB**. يتطلَّب إما ترقية إلى Pro (5 GB) أو إبقاء backups خارج Blob (Google Drive المنهاج اليدوي الشهري).
- **Orphan cleanup**: `/api/cron/daily` يحذف Blob files للمنتجات `active=false AND deleted_at > 30 days` + Blob files بلا مرجع في `product_images`.
- **CDN**: Blob URLs عبر Vercel CDN تلقائياً.

**ملاحظة — سياسة overwrite (D-60)**:
- `addRandomSuffix: false` في `put()` → deterministic URL.
- عند تبديل صورة: UPLOAD مع نفس key → Vercel يستبدل + يُبطِل CDN cache تلقائياً.
- لا حاجة لـ tracking URLs في DB — URL constructible من `product_id + slot`.

### 5. Groq API

- **Models**: `whisper-large-v3` + `llama-3.1-8b-instant`.
- **Rate limits**: عالية جداً على الـ free tier (كافية لـ 20 مستخدم × 10 voice/min).
- **Latency**: Whisper ~1.5s لـ 5s audio، Llama ~500ms لـ 400 tokens.
- **Fallback**: عند فشل `/api/voice/process` → رسالة "الخدمة الصوتية متوقفة مؤقتاً" + redirect للإدخال اليدوي.

### 6. Recharts

- مكتبة React لرسوم الـ dashboards.
- Tree-shakeable — bundle size معقول.

### 7. Vercel Cron — 2 endpoints بعد الدمج (D-23)

```
/api/cron/daily   (0 3 * * *)   → 03:00 Europe/Paris
  - cleanup: activity_log > 90d, voice_logs > 30d, notifications read > 60d, idempotency_keys expired
  - flip payment_schedule.status = 'overdue' للدفعات المتأخرة
  - تذكير reconciliation يومي للـ managers/GM (يُولِّد notifications)
  - orphan Blob cleanup (صور منتجات active=false > 30d)

/api/cron/hourly  (0 * * * *)   → كل ساعة
  - prune voice_rate_limits rows (expired windows)
  - queued notifications dispatch (إذا وُجد retry queue)
```

كلاهما محمي:
```
Authorization: Bearer ${CRON_SECRET}
```

`CRON_SECRET` في Vercel env vars، يُرسَل تلقائياً في headers الـ cron من Vercel.

---

## تكاملات مؤجَّلة (غير ضرورية لـ MVP)

| الخدمة | الاستخدام المحتمل | سبب التأجيل |
|--------|-------------------|-------------|
| Resend / Brevo | إشعارات بريد | Polling + bell في التطبيق كافية |
| Web Push | إشعارات push | تعقيد + دعم ضعيف على iOS < 16.4 |
| Twilio / Vonage SMS | OTP / إشعارات SMS | تكلفة + غير حرجة |
| Sentry | Error tracking | الـ free tier مفيد لكن اختياري — Phase 6 |
| Mapbox / Google Maps | تتبع السائق | يتطلب API key مدفوع لحجم حقيقي |

---

## مفاتيح البيئة المطلوبة

```
# Database
DATABASE_URL=postgresql://...?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://...?sslmode=require

# Auth
AUTH_SECRET=<32+ chars>
AUTH_URL=https://vitesse-eco.fr

# Voice
GROQ_API_KEY=gsk_xxx

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx

# Cron security
CRON_SECRET=<random>
```

**ملاحظة (D-41)**: `FEATURE_SSE` محذوف — Polling هو الحل الوحيد.
