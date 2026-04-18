# التكاملات الخارجية — Integrations

> **رقم العنصر**: #32 | **المحور**: ح | **الحالة**: مكتمل

---

## التكاملات الحالية

| الخدمة | الغرض | المكتبة / الاتصال |
|--------|-------|------------------|
| **Neon PostgreSQL** | قاعدة البيانات | @vercel/postgres مع connection pooling |
| **NextAuth.js** | المصادقة وإدارة الجلسات | CredentialsProvider + JWT |
| **Vercel** | الاستضافة والنشر | Serverless Functions |
| **Groq API** | تحويل الكلام لنص + LLM | Whisper Large v3 + Llama-3.1-8b |
| **WhatsApp** | مشاركة تفاصيل الطلب | رابط wa.me مع نص مُعد مسبقًا |
| **bcryptjs** | تشفير كلمات المرور | 12 rounds hashing |
| **Zod** | التحقق من المدخلات | Schema validation |
| **Fuse.js** | البحث الضبابي | Entity resolution للنظام الصوتي |

---

## متغيرات البيئة المطلوبة

| المتغير | الغرض |
|---------|-------|
| POSTGRES_URL | اتصال Neon مع connection pooling |
| POSTGRES_URL_NON_POOLING | اتصال مباشر (للمعاملات الطويلة) |
| NEXTAUTH_SECRET | سر JWT |
| NEXTAUTH_URL | عنوان التطبيق |
| GROQ_API_KEY | مفتاح Groq API (Whisper + LLM) |
| ALLOW_DB_RESET | بوابة إعادة تعيين قاعدة البيانات (false في الإنتاج) |

---

## تكاملات غير موجودة حاليًا

| الخدمة | الحالة |
|--------|--------|
| بوابة دفع إلكتروني | غير موجود |
| بريد إلكتروني (SMTP/SES) | غير موجود |
| SMS | غير موجود |
| Slack | غير موجود |
| نظام محاسبة خارجي | غير موجود |
| نظام شحن (tracking) | غير موجود |
