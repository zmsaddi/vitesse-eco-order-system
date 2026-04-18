# متطلبات الأمان — Security Requirements

> **رقم العنصر**: #17 | **المحور**: ج | **الحالة**: قيد التحديث

---

## المصادقة (Authentication)

| البند | التفصيل |
|-------|---------|
| المكتبة | Auth.js v5 (يحل محل NextAuth.js v4) |
| الاستراتيجية | JWT (CredentialsProvider) |
| التشفير | bcryptjs (12 rounds) |
| محتوى Token | id, username, name, role |
| حماية المسارات | middleware.ts في جذر المشروع |
| التحقق النشط | active=false → رفض تسجيل الدخول |

## التفويض (Authorization)

| البند | التفصيل |
|-------|---------|
| الدالة | `requireAuth(request, roles?)` — تُستدعى في كل API route |
| الأدوار | 6: pm, gm, manager, seller, driver, stock_keeper |
| الصلاحيات المتقدمة | جدول permissions (role × resource × action) — المرحلة 6 |
| دالة التحقق | `can(role, resource, action)` تحل محل المصفوفات اليدوية |

## Rate Limiting

| البند | التفصيل |
|-------|---------|
| تسجيل الدخول | مؤجل — ليس أولوية (10-20 مستخدم) — قرار C3 |
| الصوت | 10 طلبات/دقيقة لكل مستخدم (in-memory Map) |
| لا Redis | rate limiting في الذاكرة — مقبول لهذا الحجم |

## حماية قاعدة البيانات

| البند | التفصيل |
|-------|---------|
| Reset | ALLOW_DB_RESET=false افتراضياً + NODE_ENV check + confirmation phrase |
| SSL | اتصال Neon يستخدم SSL تلقائياً |
| Transactions | withTx() لكل عملية مالية |
| Locks | FOR UPDATE على المخزون والأرصدة |

## نسخ احتياطي

زر يدوي في الإعدادات لـ PM/GM — تنزيل pg_dump / استعادة (قرار C4).
