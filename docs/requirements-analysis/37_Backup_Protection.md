# النسخ الاحتياطي وحماية البيانات — Backup & Protection

> **رقم العنصر**: #37 | **المحور**: ح | **الحالة**: مواصفات نهائية

---

## طبقات الحماية

| # | الطبقة | التفصيل |
|---|--------|---------|
| 1 | **Neon PITR** | Point-in-Time Recovery تلقائي، 7 أيام retention على الـ free tier. يُسترَد عبر إنشاء branch من timestamp. |
| 1b | **Automated Weekly Backup (D-43)** | `/api/cron/weekly` أحد 03:00 → `pg_dump` مضغوط + مشفَّر (AES-256-GCM) → Vercel Blob. retention 12 نسخة. |
| 2 | **نسخ يدوي (C4)** | زر في `/settings` لـ PM/GM — تنزيل `pg_dump` كـ `.sql.gz`، أو استعادة من ملف. |
| 3 | **Soft-delete** | لا حذف نهائي للسجلات المالية/الحركية. الاسترداد فوري عبر `UPDATE ... SET deleted_at = NULL`. |
| 4 | **حماية Reset** | endpoint `/api/init` يرفض `action=reset` إلا بثلاث شروط مجتمعة: `NODE_ENV != 'production'` + `ALLOW_DB_RESET='true'` + confirmation phrase `"احذف كل البيانات نهائيا"` |
| 5 | **SSL** | كل الاتصالات مع Neon تستخدم `sslmode=require` |
| 6 | **سجل تدقيق** | `activity_log` + `cancellations` + `price_history` + `treasury_movements` — كل تغيير له ظل audit |
| 7 | **read-only role** | Phase 6 ينشئ role `reporter` بـ `SELECT` فقط لـ reporting queries |

---

## إجراء النسخ اليدوي

### التنزيل

```
GET /api/backup/download  (PM/GM فقط)
```

1. يُشغِّل `pg_dump --format=custom --schema=public --no-owner` على DB connection.
2. يُعيد stream مضغوط (`.dump.gz`).
3. الاسم الافتراضي: `vitesse-eco-backup-YYYYMMDD-HHmm.dump.gz`.
4. يُسجَّل في `activity_log` (action='backup_download').

### الاستعادة

```
POST /api/backup/restore  (PM فقط، في dev/staging فقط)
```

1. يرفع `.dump.gz` في multipart form.
2. يتحقق من `NODE_ENV != 'production'` — يرفض في prod.
3. يُنشئ Neon branch جديد من الـ dump.
4. يطبع URL الـ branch للمراجعة اليدوية قبل الاستبدال.

**ملاحظة**: الاستعادة المباشرة على قاعدة الإنتاج **لا تُقدَّم من UI** — يجب أن تتم يدوياً عبر Neon Console لمنع خطأ بشري كارثي.

---

## سياسة الاسترداد

### استرداد soft-deleted records

```
POST /api/admin/restore
Body: { entity_type, entity_id }
```
PM فقط. يضع `deleted_at = NULL`. يُسجَّل في `activity_log`.

### استرداد من Neon PITR

1. Neon Console → Branches → "Restore to a point in time".
2. اختر timestamp < 7 أيام.
3. Neon ينشئ branch جديد يحتوي البيانات من تلك اللحظة.
4. يدوياً: قارن بين الـ branches → اكتب migration SQL للنقل.
5. طبِّق على production branch.
6. احذف restore branch بعد الانتهاء.

**وقت الاستجابة المستهدف (RTO)**: 2 ساعة لاستعادة جزئية، 6 ساعات لكارثة كاملة.

**فقدان البيانات المقبول (RPO)**: 5 دقائق (Neon PITR بدقة ثواني).

---

## سيناريوهات الحوادث

| السيناريو | الاستجابة |
|----------|-----------|
| مستخدم حذف طلب عن طريق الخطأ | `deleted_at` → استعادة فورية من UI |
| تعديل خاطئ على منتج (سعر) | `price_history` يحتوي القيم القديمة → يدوياً UPDATE |
| فقدان كلمات مرور | PM يُعيد تعيين عبر `/users` |
| بيانات فاسدة (SQL خاطئ) | Neon PITR → branch من ما قبل الحادث → نسخ selective |
| فقدان DB كاملة | PITR + restore procedure أعلاه + آخر manual backup |
| تسرب مفاتيح | تدوير عبر Vercel env vars + تدوير Neon password |

---

## جدولة النسخ (D-43 — Automated Backups)

### Layer 1 — Neon PITR (تلقائي)

- 7 أيام retention على الـ free tier.
- Restoration: Neon Console → Branches → Restore to point in time.

### Layer 2 — Automated Weekly Backup (D-43 — جديد)

`/api/cron/weekly` (أحد 03:00 Europe/Paris) ينفِّذ:

```ts
// src/app/api/cron/weekly/route.ts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  // 1. pg_dump (streaming via Neon REST branch restore API)
  const dumpStream = await neonRestDump({ branch: 'main', format: 'custom' });

  // 2. Compress + encrypt (AES-256-GCM بمفتاح من BACKUP_ENCRYPTION_KEY)
  const compressed = await gzipAndEncrypt(dumpStream);

  // 3. Upload to Vercel Blob
  const yearWeek = getISOWeek(new Date()); // e.g. "2026-W17"
  await put(`backups/${yearWeek}.dump.gz.enc`, compressed, {
    access: 'public',
    addRandomSuffix: false, // D-60 deterministic keys
  });

  // 4. Retention: keep last 12 weekly dumps, delete older
  await cleanupOldBackups(12);

  return Response.json({ ok: true, backup: `${yearWeek}.dump.gz.enc` });
}
```

- **تكلفة Blob**: ~12 نسخة × ~50MB مضغوطة = ~600MB (ضمن حصة Vercel Hobby 5GB).
- **Encryption**: AES-256-GCM. key في `BACKUP_ENCRYPTION_KEY` env var. **لا تُفقَد** — الـ dumps غير قابلة للاستعادة بدونها.

### Layer 3 — Manual Monthly External Copy

مسؤولية PM شهرياً:
1. تنزيل أحدث نسخة أسبوعية من Blob (signed URL عبر `/settings`).
2. رفعها إلى Google Drive / external disk خارج Vercel+Neon (كارثة سلسلة التبعيات).

### Layer 4 — Manual On-Demand

زر `/settings` لـ PM/GM لتنزيل `pg_dump` حالي فوراً (BR-C4).

---

## قيود معروفة (بعد D-43)

- **Neon PITR 7 أيام فقط** على free tier (bedrock للاسترداد السريع).
- **Vercel Blob retention**: 12 نسخة أسبوعية = ~84 يوم ≈ 3 أشهر.
- **فوق 3 أشهر**: تعتمد على Google Drive اليدوي.
- **Code commerce art. L123-22**: 10 سنوات retention قانوني = نقطة ضعف إذا PM نسي النقل الشهري. يُوصى بـ **cron job ثالث** عبر external service (مثل cron-job.org) يُنبِّه PM بالرسالة في حال انقطع `/api/cron/weekly`.
