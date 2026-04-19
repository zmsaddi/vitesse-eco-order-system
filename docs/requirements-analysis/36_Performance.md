# الأداء — Performance

> **رقم العنصر**: #36 | **المحور**: ح | **الحالة**: مواصفات نهائية

---

## ميزانيات الأداء (Performance Budgets)

- **زمن استجابة API p95**: ≤ 500ms للـ reads، ≤ 1.5s للـ writes (مع transactions).
- **حجم bundle الأولي**: ≤ 200 KB gzipped.
- **LCP (Largest Contentful Paint)**: ≤ 2.5s على اتصال 3G سريع.
- **حجم قاعدة البيانات المتوقع**: < 500 MB للسنة الأولى.
- **حجم activity_log**: cap عند 90 يوم (cron cleanup).
- **حجم voice_logs**: cap عند 30 يوم.

## استراتيجية Real-time (D-14 + D-41 + D-42)

- **Polling فقط**: لا SSE (D-41 — حُذف كلياً).
- **Notifications (D-42)**: on-demand عند فتح Bell Dropdown. badge count يُرفَع عبر `X-Unread-Count` header في كل response عادي.
- **DataTables (D-42)**: `refetchInterval: 90s` افتراضي، يُضاعَف إلى `180s` بعد 3 دقائق idle.
- **Interaction grace**: إيقاف polling 8s بعد أي تفاعل.
- **Tab visibility**: إيقاف polling عند تبديل التبويب.
- **Neon budget monitoring (D-42)**: `/api/cron/hourly` يحدِّث `settings.neon_hours_used_this_month`. alert عند 150h من 190h الحصة الشهرية.

## فهارس حرجة

موثَّقة في ملف 02_DB_Tree.md لكل جدول. أهمها:
- `orders(client_name)`, `orders(payment_status)`
- `order_items(product_name)`
- `bonuses(username)`, `bonuses(settlement_id)`
- `payments(order_id)`, `payments(date)` للتقارير
- `entity_aliases(entity_type, normalized_alias)` UNIQUE
- `notifications(user_id, read, created_at DESC)` للصندوق الوارد
- `activity_log(entity_type, entity_id, timestamp DESC)`

## Retention Policies

```sql
-- activity_log > 90 يوم
DELETE FROM activity_log WHERE timestamp < NOW() - INTERVAL '90 days';
-- voice_logs > 30 يوم
DELETE FROM voice_logs WHERE created_at < NOW() - INTERVAL '30 days';
-- notifications المقروءة > 60 يوم
DELETE FROM notifications WHERE read = true AND read_at < NOW() - INTERVAL '60 days';
```
تعمل عبر Vercel Cron اليومي.

---

## الفهارس

| الجدول | العمود/الأعمدة | النوع |
|--------|---------------|------|
| users | username | UNIQUE |
| products | name | UNIQUE |
| orders | ref_code WHERE != '' | UNIQUE |
| orders | client_name | INDEX |
| orders | payment_status | INDEX |
| order_items | product_name | INDEX |
| purchases | ref_code WHERE != '' | UNIQUE |
| purchases | supplier | INDEX |
| deliveries | ref_code WHERE != '' | UNIQUE |
| invoices | ref_code WHERE != '' | UNIQUE |
| clients | (name, phone) WHERE phone != '' | UNIQUE |
| clients | (name, email) WHERE email != '' | UNIQUE |
| suppliers | (name, phone) WHERE phone != '' | UNIQUE |
| bonuses | (delivery_id, role, item) | UNIQUE |
| price_history | product_name | INDEX |
| cancellations | order_id | INDEX |
| entity_aliases | (entity_type, normalized_alias) | UNIQUE |
| ai_patterns | (spoken_text, correct_value, field_name, username) | UNIQUE |
| notification_preferences | (user_id, notification_type, channel) | UNIQUE |
| permissions | (role, resource, action) | UNIQUE |

## Connection Pooling

- Neon Serverless مع @neondatabase/serverless
- Connection pooling مدمج

## Caching

- TanStack Query: stale-while-revalidate + auto-refetch on window focus
- لا Redis — الذاكرة فقط (10-20 مستخدم)
- voice entity cache: Fuse.js index يُبنى عند أول استخدام

## حدود Neon Free

- 0.5GB storage → الصور في Blob/Cloudinary (ليس DB)
- 190 compute hours/month → كافي لـ 10-20 مستخدم
- activity_log: تنظيف بعد 6 أشهر إذا لزم
