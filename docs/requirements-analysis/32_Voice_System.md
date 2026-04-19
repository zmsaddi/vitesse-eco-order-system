# النظام الصوتي — Voice System

> **رقم العنصر**: #32 | **المحور**: ز | **الحالة**: مواصفات نهائية

---

## الهدف

إدخال ثلاثة أنواع من العمليات (`sale` / `purchase` / `expense`) عبر الصوت باللهجات العربية المتعددة، مع طبقة تأكيد بصرية قبل الحفظ. يدعم v2 الطلبات **متعددة الأصناف** (`sale.items[]`).

---

## البنية

### النماذج (Models)
- **STT**: Groq Whisper Large v3 (`whisper-large-v3`) — لغة `ar`.
- **NLP**: Groq `llama-3.1-8b-instant` — 5× أسرع من 70B؛ الجودة كافية لمخطَّط مقيَّد.
- معايير LLM (D-31 محدَّث): `temperature: 0.1`, `max_tokens: 400`, **`tool_use`** (ليس `json_object`). JSON mode كان يُنتج ~80-85% structural validity فقط؛ `tool_use` يُلزم schema على مستوى decoder → ~97%.

### الإعدادات الحاكمة
| Key | القيمة | الوصف |
|-----|-------|-------|
| `voice_rate_limit_per_min` | 10 | عدد الطلبات المسموحة لكل مستخدم في الدقيقة |
| `voice_max_audio_seconds` | 30 | أقصى مدة تسجيل |
| `voice_min_audio_ms` | 1500 | أقل مدة مقبولة |

---

## Pipeline مفصَّل (12 خطوة)

```
POST /api/voice/process  (multipart form-data: audio=Blob)
```

1. **Auth + role check**: `pm|gm|manager|seller` فقط. الآخرون 403.
2. **Rate limit (D-73 — DB-only، يُلغي D-33)**: `voice_rate_limits` جدول Neon فقط. لكل request: `SELECT COUNT` + `INSERT` داخل `withTx`. كلفة ~120ms × 2 queries = 0.25s (مقبول قبل Whisper ~1.5s+). بساطة > hybrid معقَّد مع stateless serverless.
   ```ts
   // src/modules/voice/rate-limit.ts
   const windowStart = new Date(Date.now() - 60_000);
   const [{ count }] = await tx.select({ count: sql`count(*)` })
     .from(voiceRateLimits)
     .where(and(eq(voiceRateLimits.userId, userId), gte(voiceRateLimits.createdAt, windowStart)));
   if (Number(count) >= 10) throw new VoiceRateLimitError();
   await tx.insert(voiceRateLimits).values({ userId, createdAt: new Date() });
   ```
   Cleanup عبر `/api/cron/hourly`: `DELETE FROM voice_rate_limits WHERE created_at < NOW() - INTERVAL '90 seconds'`.
3. **Audio validation**: `size ≤ 10 MB`. خلاف ذلك 413.
4. **Parallel fetch — مع entity cache (D-34)**:
   - Whisper transcription مع vocabulary prompt (أولوية: أفعال → top 15 products → top 20 clients → top 10 suppliers، حتى ~150 حرف).
   - DB بالتوازي: `products` (15)، `clients` (20)، `suppliers` (10)، `ai_patterns` (20 for user + global)، `ai_corrections` (5 الأحدث).
   - **Entity cache (D-34)**: `src/modules/voice/entity-cache.ts` module-level Map مع TTL 60s. invalidation hooks على mutations (`onProductChange`, `onClientChange`). يوفِّر ~60% queries في الذروة.
5. **Blacklist check on RAW transcript** (قبل normalization) — يمنع "في" → "V" من تمرير blacklist.
6. **Hallucination heuristic soft**: إذا `length ≥ 20 AND لا فعل` → warning فقط، لا رفض.
7. **Rule-based action classifier** (pre-LLM hint، يفوز إذا تعارض مع LLM):
   ```js
   const SALE_VERBS     = /(بعت|بعنا|بيعت|بِعت|بيع)/;
   const PURCHASE_VERBS = /(اشتريت|اشترينا|شريت|شرينا|جبت|جبنا|أخذت من|استلمت من)/;
   const EXPENSE_VERBS  = /(دفعت|صرفت|راتب|أجار|إيجار|بنزين|وقود|فاتورة)/;
   const BAT_SALE_CONTEXT = /بات.{0,40}(لـ|لِـ|للعميل|بألف|بمئة|بخمسمية|يورو)/;
   ```
8. **LLM extraction**: يُبنى الـ prompt ديناميكياً مع حقن الكتالوج والأنماط (انظر قسم "النص الكامل للـ prompt").
9. **Post-LLM override**: إذا `ruleAction !== llmAction` → rule يفوز + warning `'صحّحت التصنيف بناءً على فعل صريح'`.
10. **Entity resolution** (3 layers — لكل حقل client/product/supplier):
    - `matched` → استبدال القيمة بالاسم الكنسي
    - `ambiguous` → حقل فارغ + `candidates[0..2]` + warning
    - `not_found` → `isNewClient/isNewProduct` flag
11. **Required fields validation**:
    ```
    sale:     [client_name, item, quantity, unit_price, payment_type]
    purchase: [supplier, item, quantity, unit_price, sell_price, payment_type]
    expense:  [category, description, amount, payment_type]
    ```
    الحقول المفقودة → `missing_fields[]` يُبرز في UI ببرتقالي.
12. **Price floor check** (soft): لو `item` معروف و `unit_price < product.buy_price` → warning (ليس رفض).
13. **voice_logs insert**:
    ```sql
    INSERT INTO voice_logs (date, username, transcript, normalized_text, action_type, status, debug_json) ...
    ```
    `debug_json` يحتوي كل سياق الـ pipeline للتدقيق اللاحق.
14. **Response**:
    ```json
    {
      "_schema": 1,
      "action": "register_sale | register_purchase | register_expense",
      "data": { /* parsed */ },
      "warnings": [],
      "transcript": "...",
      "normalized": "...",
      "missing_fields": [],
      "voiceLogId": 123,
      "suggestAddProduct": false,
      "suggestedProductName": null
    }
    ```

---

## النص الكامل للـ System Prompt

```
أنت مساعد استخراج بيانات لمتجر "Vitesse Eco" (دراجات كهربائية، إكسسوارات، قطع تبديل). الموظفون يتكلمون عربي بلهجات (شامي، خليجي، مصري، مغربي).

⚠️ قاعدة مطلقة: حقل item دائماً بالإنجليزية. لو لم تعرف الاسم → اكتبه بحروف لاتينية. ممنوع item بالعربي.

ACTION:
بعت/بايع/بيع/سلّمت → "sale"
اشتريت/شريت/جبت/شراء/وصّلني → "purchase"
مصروف/صرفت/دفعت/خرج/حساب → "expense"

═══════════════════════════════════════
SCHEMA — بيع (sale) متعدد الأصناف:
═══════════════════════════════════════
{
  "action": "sale",
  "client_name": "string",
  "client_phone": "string|null",
  "client_email": "string|null",
  "client_address": "string|null",
  "items": [
    { "item": "ENGLISH ONLY", "quantity": number, "unit_price": number }
  ],
  "payment_type": "cash|bank|credit|null",
  "notes": null
}

SCHEMA — شراء (purchase):
{
  "action": "purchase",
  "supplier": "اسم المورد بدون حروف جر",
  "item": "اسم المنتج بالإنجليزي",
  "quantity": number, "unit_price": number, "sell_price": number|null,
  "category": "دراجات كهربائية | بطاريات/شواحن | إكسسوارات | قطع تبديل | null",
  "payment_type": "cash|bank|credit|null", "notes": null
}

SCHEMA — مصروف (expense):
{
  "action": "expense",
  "category": "إيجار|رواتب|نقل وشحن|صيانة وإصلاح|تسويق وإعلان|كهرباء وماء|تأمين|أدوات ومعدات|أخرى",
  "description": "string",
  "amount": number,
  "payment_type": "cash|bank|credit|null",
  "notes": null
}

═══════════════════════════════════════
قواعد الإرجاع:
═══════════════════════════════════════
1. JSON فقط — لا نص قبله أو بعده
2. كل حقول الـ schema موجودة (null للمجهول)
3. لا تفترض payment_type=cash تلقائياً
4. لا تضف حروف جر لبداية الأسماء
5. لا ترفض أبداً — ارجع أفضل فهمك
```

يُحقن قبل الإرسال:
- قائمة أسماء المنتجات الشائعة.
- قائمة أسماء العملاء الأخيرة + الأكثر تكراراً.
- قائمة الموردين.
- آخر 8 تصحيحات من `ai_corrections` مجمَّعة حسب `field_name`.
- 8 أنماط للمستخدم + 7 أنماط عامة من `ai_patterns`.

---

## Normalizer — 4 Phases

`src/modules/voice/normalizer.ts` يحوِّل النص العربي إلى شكل قابل للمطابقة:

| Phase | ما يفعل | مثال |
|-------|---------|------|
| 0 | مركَّبات الآلاف | `ثلاثة آلاف وخمسمية وسبعين` → `3570` |
| 1 | أرقام مركَّبة بـ "و" | `ألفين وخمسمية` → `2500` |
| 2 | كلمات أرقام + بادئات (ب/ل/لِ) | `بخمسين` → `ب50` |
| 3 | نقل حرفي عربي→لاتيني | `في 20 برو` → `V20 Pro` |
| 4 | دمج حرف+رقم | `G T` → `GT` ; `V 20` → `V20` |

### Arabic-safe boundary helper (مطلوب)

`\b` في JS لا يعمل على العربية. البديل:
```ts
function arabicSafeBoundary(word: string, { allowPrefix = false } = {}) {
  const lookbehind = `(?<=^|[${ARABIC_BOUNDARY}])`;
  const prefix = allowPrefix ? `(${ARABIC_PROCLITIC}?)` : '';
  const lookahead = `(?=$|[${ARABIC_BOUNDARY}])`;
  return new RegExp(`${lookbehind}${prefix}${word}${lookahead}`, 'g');
}
```

### `normalizeForMatching(text)`
توحيد عميق للمقارنة: طي Alif variants (ا,أ,إ,آ→ا)، Taa Marbuta (ة↔ه)، Hamza (ء=)، أرقام شرقية → لاتينية، lowercase.

---

## Blacklist (11 عبارة ثابتة)

```ts
export const BLACKLIST_PHRASES = [
  // Arabic YouTube boilerplate
  'اشتركوا في القناة', 'اشترك في القناة', 'لا تنسوا الاشتراك',
  // English
  'subscribe to my channel', 'thanks for watching',
  // French
  'abonnez-vous', "merci d'avoir regardé",
  // Whisper non-speech markers
  '[موسيقى]', '[music]', '[applause]', '[background noise]', '[noise]',
];
```
الفحص يتم على **الـ RAW transcript** قبل normalization.

---

## Entity Resolver — 3 Layers

`src/modules/voice/resolver.ts`:

```
Layer 0 (O(1)): exact learned alias → frequency +=1 → {matched, confidence:'high', method:'learned'}
Layer 1a: Fuse.js multi-field — weights name(0.25) normalized(0.35) clean(0.15) alias(0.25); threshold 0.45; distance 150; minMatchCharLength 2; top 5.
Layer 1b: Jaro-Winkler على كل الكيانات — إذا JW > 0.7 → candidate.
Layer 2: Context boost — entities in recentClients / recentSuppliers +0..0.3 (يتناقص 0.05 لكل موقع).

Final scoring:
  fuseNorm    = 1 - min(fuseScore, 1)
  freqBoost   = Math.min(0.15, Math.log10(frequency + 1) * 0.05)   // D-32 capped
  totalScore  = fuseNorm*0.4 + jwScore*0.35 + contextScore*0.25 + freqBoost

Decision:
  > 0.6  → matched (high)
  > 0.35 → matched (medium)
  2+ candidates → ambiguous (return top 3)
  else → not_found (isNewProduct=true للمنتجات)
```

**freqBoost cap (D-32)**: `Math.min(0.15, Math.log10(frequency + 1) * 0.05)` — يمنع alias متكرر 1000× من التغلُّب على Fuse+JW. Cron daily: `UPDATE entity_aliases SET frequency = FLOOR(frequency * 0.98)` لتخفيف bias قديم.

عتبة 0.45 اختيارها مقصود: 0.4 تُنتج false positives كثيرة على النقل الحرفي العربي.

---

## Learn Endpoint

```
POST /api/voice/learn
```
Body:
```json
{
  "transcript": "...",
  "aiData": { /* ما استخرجه LLM */ },
  "userData": { /* ما حفظه المستخدم بعد التعديل */ },
  "actionType": "register_sale"
}
```

Logic:
1. لكل حقل قابل للتعلم (`payment_type`, `item`, `quantity`, ...): إذا المستخدم قدَّم قيمة AND (AI أغفلها أو AI اختلف) → أضف إلى corrections.
2. **لا تتجاهل** الحقول التي لم يُخرِجها AI أصلاً (ai_output='(missing)'). هذا يُعلِّم النظام على الحقول المفقودة.
3. لكل correction: `INSERT INTO ai_corrections` + `UPSERT INTO ai_patterns` (frequency += 1 on conflict).
4. **Reinforcement guard**: زيادة `ai_patterns.frequency` تحدث **فقط** عند `corrections.length === 0 AND userAddedFields.length === 0` — يمنع التعزيز الخاطئ عندما يُضيف المستخدم حقلاً لم يفهمه الـ AI.

```
PUT /api/voice/learn
```
Body: `{ voiceLogId, actionId }` — يربط `voice_logs.action_id` بالسجل المُنشأ بعد الحفظ (مسار تدقيق).

---

## VoiceButton (recording UX)

States: `idle` → `recording` → `processing` → `idle`.

**Silence detector** (Web Audio RMS، يعمل بالتوازي مع MediaRecorder):
- `SILENCE_RMS_THRESHOLD = 0.02`.
- Auto-stop بعد 2500ms من الصمت — **فقط** إذا كان maxRms قد تجاوز العتبة مرة (أي تم كشف صوت).
- `MIN_DURATION_MS = 1500` — أقل مدة مقبولة.

Post-stop validation (client-side، قبل إرسال للخادم):
- `duration < 1500ms` → "التسجيل قصير جداً".
- `blob.size < 500 bytes` → "التسجيل فارغ".
- `maxRms < threshold` → "لم أسمع شيئاً".

---

## VoiceConfirm (approval modal)

يظهر بعد `/api/voice/process` وقبل الحفظ.

### أقسام الشاشة
1. Header — tabs ملوَّنة: `sale` (أخضر) / `purchase` (أزرق) / `expense` (برتقالي). قابل للتبديل.
2. Transcript — `🎙️ سمعت: «{transcript}»`.
3. Warnings amber box — مشاكل الاستخراج.
4. Review banner:
   - مع `missing_fields[]` غير فارغ: "الحقول المميَّزة بالبرتقالي لم يفهمها الذكاء الاصطناعي".
   - وإلا: "✓ تأكد من صحة كل الحقول".
5. Form fields — حسب `action`:
   - `sale`: list من `items[]` (قابلة للإضافة/الحذف) + client + payment.
   - `purchase` / `expense`: نموذج مفرد بالحقول أعلاه.
   - **حقل `item` = SmartSelect (D-47)**: ليس `Input` نصي — بل `SmartSelect` مُحفَّز بالقيمة المستخرجة من LLM. يُظهر المنتجات المطابقة من catalog (عبر entity resolver) مع `name_en` + `name_ar`. زر "+ منتج جديد" في القائمة → يفتح `CreateProductDialog` مباشرة. السبب: قاعدة "item بالإنجليزية" تربك seller arabophone إذا Groq أخطأ.
6. BUG-30 soft check — سعر بيع < سعر شراء → تحذير برتقالي + hard alert عند الحفظ.

### سلوك الحفظ
- POST إلى `/api/orders` أو `/api/purchases` أو `/api/expenses`.
- بعد النجاح: `PUT /api/voice/learn` لربط `voice_logs.action_id` + `POST /api/voice/learn` لتعلُّم التصحيحات. `voice_logs.status = 'saved'` (أو `'edited_and_saved'` إن عدَّل المستخدم — D-63).
- Idempotency flag يمنع الـ double-submit.

### سلوك الإلغاء (D-63)

- عند إغلاق VoiceConfirm بلا حفظ: client يُرسل `PUT /api/voice/cancel` → يُحدِّث `voice_logs.status = 'abandoned'`.
- قيم enum الكاملة: `'pending' | 'processed' | 'saved' | 'abandoned' | 'edited_and_saved' | 'groq_error'`.

---

## الخطأ والتحذير (UX convention)

| حالة | التأثير | مثال |
|------|--------|------|
| خطأ عام (الخلفية) | 4xx JSON + رسالة عربية | `{ error: 'غير مصرح' }` |
| تحذير (warning) | لا يمنع الحفظ | "الحقل لم يُفهَم — راجعه" |
| رفض صوتي (client) | لا إرسال للخادم | "التسجيل قصير جداً" |
| hallucination مؤكَّد | رفض بـ 400 | "نص غير معترف به — حاول مرة أخرى" |
| rate limit | 429 | "تجاوزت الحد — انتظر دقيقة" |

---

## الأدوار والسياسات

- `pm, gm, manager, seller` → يستطيعون استخدام `/api/voice/process`.
- `driver, stock_keeper` → 403.
- `ai_corrections` و `ai_patterns` مشتركة بين جميع المستخدمين (تعلُّم جماعي)، مع `username` field لتتبع المصدر.

---

## الجداول المستخدمة

- `voice_logs` — سجل كل محاولة إدخال صوتي مع `debug_json`.
- `ai_corrections` — تصحيحات المستخدم للحقول.
- `ai_patterns` — أنماط متكررة مع frequency للتعزيز.
- `entity_aliases` — الأسماء البديلة (seed + user-learned) مع UNIQUE على `(entity_type, normalized_alias)`.

تفاصيل الأعمدة في 02_DB_Tree.md (جداول 34-36).
