# التزامن — Concurrency

> **رقم العنصر**: #29 | **المحور**: و | **الحالة**: مواصفات نهائية

---

## Driver Strategy (D-05)

- **Writes**: `@neondatabase/serverless` Pool (WebSocket) + `drizzle-orm/neon-serverless` `transaction()`. يدعم المعاملات متعددة الجمل مع `BEGIN/COMMIT/ROLLBACK`.
- **Reads (اختياري)**: `@neondatabase/serverless` `neon(...)` HTTP driver. سريع لكن **لا يدعم المعاملات** — SELECT بسيطة فقط.
- **قاعدة واحدة**: كل كتابة مالية تمر عبر `withTx()` helper.
- **ملاحظة حرجة**: الكود الذي يستخدم `neon-http` driver في Phase 0 القديم كان `withTx` وهمي (`return fn(db)`) — سببه أن HTTP لا يدعم transactions. هذا **مُصحَّح** في Phase 0 الجديد عبر التحول إلى WebSocket Pool.

```ts
// src/db/client.ts (D-26: lifecycle controlled)
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// Pool مُخصَّص per-invocation — لا instance global (D-26)
export function createPool() {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 1,                          // واحد كافٍ لـ serverless invocation
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
  });
}

// withTx في كل route handler:
export async function withTxInRoute<T>(
  ctx: { waitUntil(p: Promise<unknown>): void } | undefined,
  fn: (tx) => Promise<T>
): Promise<T> {
  const pool = createPool();
  const db = drizzle(pool);
  try {
    return await db.transaction(fn);
  } finally {
    // D-26: ضمان إغلاق WebSocket بعد الـ response
    if (ctx?.waitUntil) {
      ctx.waitUntil(pool.end());
    } else {
      await pool.end();
    }
  }
}

// HTTP driver للقراءات one-shot (بلا pool، بلا transaction)
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
const sqlHttp = neon(env.DATABASE_URL);
export const dbRead = drizzleHttp(sqlHttp);
```

---

## Row-level locks

```sql
SELECT stock FROM products WHERE id = ? FOR UPDATE;
```

تُستخدم في:

| العملية | الجدول المقفول | السبب |
|---------|-------------|-------|
| حجز مخزون | `products` (row per product) | منع oversell |
| إعادة مخزون (إلغاء) | `products` | atomicity |
| تحصيل دفعة | `orders` | منع overpayment |
| تحديث رصيد صندوق | `treasury_accounts` | atomicity للرصيد |
| أخذ هدية من gift_pool | `gift_pool` (طلب متعدد الهدايا: lock **once at tx start** على كل الـ pool_rows قبل التحقق — Report 1 H2) |
| تسوية عمولة | `bonuses` (row per bonus) | منع تسوية مزدوجة |
| ترقيم فاتورة | `invoice_sequence (year, month)` | منع ref_code مكرَّر |

### Gift pool race protection (Report 1 H2)

عند طلب يحوي هدايا متعددة من نفس الـ pool:

```sql
-- 1. قفل كل pool rows المستخدمة في هذا الطلب — لمرة واحدة في بداية الـ tx
SELECT id, remaining_quantity
  FROM gift_pool
  WHERE product_id IN (:all_product_ids)
  FOR UPDATE;

-- 2. التحقق من كل العناصر مجتمعة (ليس per-item)
-- 3. إذا أي remaining < requested → ROLLBACK
-- 4. UPDATE gift_pool SET remaining_quantity = remaining_quantity - :qty WHERE id = :id
```

يمنع race condition حيث طلبان متزامنان يقرآن `remaining=1` ويسحبان كلاهما.

---

## Advisory locks (Session-wide)

لمنع سباقات cross-row (مثل توزيع الأرباح متعدد المستخدمين لنفس الفترة):

```sql
SELECT pg_advisory_xact_lock(hashtext(:period_key));
```

- المفتاح: `profit_distribution:{start}:{end}`.
- يُحرَّر تلقائياً عند COMMIT أو ROLLBACK.

---

## Idempotency (D-16)

### جدول `idempotency_keys`

```
key TEXT PK, username TEXT, endpoint TEXT, request_hash TEXT,
response JSONB, status_code INT,
created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ
```

### Flow داخل كل mutating endpoint

```ts
export async function POST(req: Request) {
  const idemKey = req.headers.get('Idempotency-Key');
  const body = await req.json();
  const bodyHash = sha256(JSON.stringify(body));

  if (idemKey) {
    // check cache
    const existing = await db.select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idemKey))
      .limit(1);

    if (existing.length) {
      if (existing[0].requestHash !== bodyHash) {
        return NextResponse.json(
          { error: 'مفتاح Idempotency يتكرر مع body مختلف', code: 'IDEMPOTENCY_KEY_MISMATCH' },
          { status: 409 }
        );
      }
      return NextResponse.json(existing[0].response, { status: existing[0].statusCode });
    }
  }

  // execute mutation
  const result = await withTx(async (tx) => {
    const out = await doMutation(tx, body);
    if (idemKey) {
      await tx.insert(idempotencyKeys).values({
        key: idemKey,
        username: session.user.username,
        endpoint: 'POST /api/orders/...',
        requestHash: bodyHash,
        response: out,
        statusCode: 201,
        expiresAt: new Date(Date.now() + 24*60*60*1000),
      });
    }
    return out;
  });

  return NextResponse.json(result, { status: 201 });
}
```

### إلزام الـ header

| Endpoint | `Idempotency-Key` |
|----------|:-----------------:|
| `POST /api/orders` | مُوصى به (UI يُولِّد UUID عند فتح form) |
| `POST /api/orders/:id/cancel` | **إلزامي** |
| `POST /api/orders/:id/collect` | **إلزامي** |
| `POST /api/payments` | مُوصى به |
| `POST /api/settlements` | **إلزامي** |
| `POST /api/distributions` | **إلزامي** |

إذا الـ header إلزامي ومفقود → 400 `IDEMPOTENCY_KEY_REQUIRED`.

### Cleanup

`/api/cron/daily`:
```sql
DELETE FROM idempotency_keys WHERE expires_at < NOW();
```

---

## Timezone-safe period boundaries

كل query يحسب فترة يجب أن تستخدم Europe/Paris:

```sql
WHERE date >= (:start AT TIME ZONE 'Europe/Paris')::date
  AND date <  ((:end + INTERVAL '1 day') AT TIME ZONE 'Europe/Paris')::date
```

Helper `getParisDateRange(start, end)` في `src/lib/date.ts` يُعيد الحدود الجاهزة للـ SQL.

---

## لا optimistic locking

النظام لا يستخدم `version` columns. القفل التشاؤمي (FOR UPDATE) كافٍ لـ 20 مستخدم متزامن.

---

## Single-statement atomicity (Neon HTTP reads)

`neon-http` driver يدعم عبارة واحدة atomic بدون `BEGIN`. استخدامه مقبول فقط لـ SELECT أو UPDATE ذرية واحدة بدون اعتماد على نتائج سابقة.
