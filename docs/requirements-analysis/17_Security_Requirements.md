# متطلبات الأمان — Security Requirements

> **رقم العنصر**: #16 | **المحور**: ج | **الحالة**: مكتمل

---

## 1. المصادقة (Authentication)

| البند | التفصيل |
|-------|---------|
| المزود | NextAuth.js — CredentialsProvider |
| استراتيجية الجلسة | JWT (JSON Web Token) |
| سر الجلسة | متغير بيئة `NEXTAUTH_SECRET` |
| صفحة الدخول | `/login` |
| التشفير | bcryptjs مع 12 rounds |

### سير المصادقة
1. المستخدم يدخل username + password
2. `authorize()` يبحث عن المستخدم بالاسم
3. فحص: هل الحساب نشط (active=true)؟
4. فحص: هل كلمة المرور صحيحة (bcrypt.compare)؟
5. نجاح → JWT token يحتوي: id, role, username
6. فشل → null (رسالة خطأ عامة)

---

## 2. التفويض (Authorization)

### على مستوى Middleware
- كل مسار محمي يفحص وجود JWT token
- المسارات غير المصادق عليها تُوجّه إلى `/login`
- التوجيه حسب الدور عند الوصول إلى `/`

### على مستوى API Routes
```javascript
const auth = await requireAuth(request, ['admin', 'manager']);
if (auth.error) return auth.error;
```
- **401**: لا يوجد token → "غير مصرح"
- **403**: الدور غير مسموح → "غير مصرح — صلاحيات غير كافية"

---

## 3. كلمات المرور

| البند | التفصيل |
|-------|---------|
| الحد الأدنى | 6 أحرف (Zod validation) |
| التشفير | bcryptjs hashSync مع 12 rounds |
| التخزين | hash فقط — لا يُخزن النص الأصلي |
| إعادة التعيين | admin يستطيع تغيير كلمة مرور أي مستخدم |

---

## 4. إدارة الحسابات

### تفعيل/تعطيل الحسابات
- admin يستطيع تفعيل/تعطيل أي حساب عبر `toggleUserActive(id)`
- الحساب المعطّل لا يستطيع تسجيل الدخول
- العمولات غير المصروفة تبقى قابلة للتسوية

---

## 5. حماية قاعدة البيانات

### منع Reset/Cleanup
- متغير بيئة `ALLOW_DB_RESET=false` (يجب أن يكون false في الإنتاج)
- POST /api/init مع action='reset' يتطلب:
  1. `NODE_ENV !== 'production'`
  2. `ALLOW_DB_RESET=true`
  3. عبارة تأكيد: "احذف كل البيانات نهائيا"

---

## 6. حماية البيانات الحساسة

### إخفاء التكلفة
- سعر التكلفة لا يُرسل للبائعين في أي استجابة API
- رسائل الخطأ للبائعين لا تكشف سعر التكلفة

### معالجة الأخطاء الآمنة
- الأخطاء بالعربي (مبدوءة بحرف عربي) → تُرسل للمستخدم
- الأخطاء التقنية → رسالة عامة + تسجيل server-side
- أخطاء قاعدة البيانات لا تُكشف أبدًا

---

## 7. الحماية من الهجمات

| الهجمة | الحماية |
|--------|---------|
| SQL Injection | استخدام tagged template literals مع @vercel/postgres (parameterized) |
| Brute Force | **مطلوب**: rate limit 5 محاولات/دقيقة لكل IP أو username |
| Session Hijacking | JWT مع secret قوي |
| CSRF | NextAuth built-in CSRF protection |
| Rate Limiting | 10 طلبات/دقيقة على /api/voice/process |
