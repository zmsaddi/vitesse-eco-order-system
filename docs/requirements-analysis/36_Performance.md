# الأداء — Performance

> **رقم العنصر**: #36 | **المحور**: ح | **الحالة**: قيد التحديث

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
