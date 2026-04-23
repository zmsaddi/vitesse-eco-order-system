# Phase 5.4 — Voice Re-evaluation Report

**Date**: 2026-04-23 (Europe/Paris)
**HEAD at re-evaluation**: `4ed89a6` (Phase 5.3 D-49 drift fix on top of `b145e15`)
**Type**: Docs-only re-evaluation per D-71 directive ("❌ Voice input (Phase 5) — مع re-evaluation أولاً").
**Decision deliverable**: ship / defer / scope-down — this report concludes.

---

## 0. Decision — defer

**Phase 5.4 Voice is deferred post-MVP.** Documented as **D-83** in `00_DECISIONS.md` (2026-04-23). Re-activation trigger is the combination of: validated seller demand after MVP v1 launch + Phase 5.5 polish shipped + production usage long enough to produce meaningful feedback.

No src code. No routes. No migrations. No Groq wiring. No voice UI. 32_Voice_System.md stays frozen; no edits to its technical spec.

The full re-evaluation that led to this decision follows. The "Options" and "Recommendation" sections at the end match the final decision.

---

## 1. What exists today (evidence inventory)

**Code**:
- `groq-sdk: ^1.1.2` — in `package.json` deps since initial scaffold.
- 4 DB tables shipped in `0000_initial_schema`: `voice_logs` (Table 34, D-63 status enum check), `voice_rate_limits` (D-73 DB-only), `entity_aliases` (Table 35, user-learned aliases), `ai_corrections` (Table 36a), `ai_patterns` (Table 36b).
- `VOICE_LOG_STATUSES` enum: `pending | processed | saved | abandoned | edited_and_saved | groq_error`.
- `voice_logs_retention_days` settings key registered in `VALID_SETTINGS_KEYS`.
- **`src/modules/voice/**`**: does not exist.
- **`src/app/api/voice/**`**: does not exist.
- **Voice UI components**: do not exist.
- **Total voice-related LOC today**: zero.

**Docs**:
- `32_Voice_System.md` — complete 341-line spec: 12-step pipeline, full system prompt, 4-phase normalizer, 3-layer entity resolver, 11-phrase blacklist, UX states, role matrix, table references.
- 7 standing decisions: D-31 (Groq `tool_use`), D-32 (freqBoost cap + decay), D-33 (superseded — was hybrid rate limiter), D-34 (entity cache TTL 60s), D-47 (item = SmartSelect), D-63 (voice_logs status enum check), D-71 (defer + re-eval), D-73 (rate limiter DB-only supersedes D-33).
- References in `17_Security_Requirements.md` + `34_Technical_Notes.md` consistent with D-73.

**Implication**: infrastructure (DB + spec + SDK) is ready. Zero implementation exists. Shipping voice = full implementation from scratch.

---

## 2. Scope estimate if shipped now

| Component | Approx LOC |
|-----------|:---------:|
| `src/modules/voice/rate-limit.ts` (D-73 DB-only) | ~60 |
| `src/modules/voice/entity-cache.ts` (D-34, TTL 60s + invalidation hooks) | ~90 |
| `src/modules/voice/normalizer.ts` (4 phases, Arabic-safe boundary) | ~220 |
| `src/modules/voice/resolver.ts` (Fuse.js + Jaro-Winkler + context + D-32 freqBoost) | ~180 |
| `src/modules/voice/blacklist.ts` | ~30 |
| `src/modules/voice/classifier.ts` (rule-based pre-LLM hint) | ~50 |
| `src/modules/voice/prompt.ts` (system prompt builder + catalog injection) | ~120 |
| `src/modules/voice/groq.ts` (SDK wrapper + D-31 tool_use) | ~100 |
| `src/modules/voice/pipeline.ts` (12-step orchestrator) | ~250 |
| `src/modules/voice/learn.ts` (ai_corrections + ai_patterns + reinforcement guard) | ~120 |
| `src/modules/voice/dto.ts` (Zod schemas per action) | ~150 |
| `src/modules/voice/permissions.ts` | ~30 |
| `src/app/api/voice/process/route.ts` (multipart form) | ~80 |
| `src/app/api/voice/learn/route.ts` (POST + PUT) | ~60 |
| `src/app/api/voice/cancel/route.ts` (PUT D-63 abandon) | ~40 |
| `src/components/voice/VoiceButton.tsx` (MediaRecorder + RMS detector) | ~180 |
| `src/components/voice/VoiceConfirm.tsx` (3 action forms + SmartSelect D-47) | ~350 |
| Cron cleanup additions (rate-limit sweep + 30d retention + freq decay) | ~40 |
| Integration tests (pipeline + rate-limit + learn + permissions + mock Groq) | ~500 |
| Unit tests (normalizer + resolver + prompt) | ~200 |
| Docs sync (15_Roles + 18_Screens + 35_API + delivery report) | — |

**Total ≈ 2,850 LOC** + new mock-Groq infrastructure + audio fixtures + possibly Playwright setup.

Benchmark against Phase 5 tranches so far:

| Tranche | Net LOC |
|---------|:-------:|
| 5.1a | ~600 |
| 5.1b | ~1,100 |
| 5.2 | ~500 |
| 5.3 | ~1,500 |

Voice would be ~2× the largest prior tranche — cannot ship as one, would be 5.4a + 5.4b + 5.4c.

---

## 3. Business value

### Hypothesis
**"Sellers prefer voice over keyboard for order entry in the field."** Plausible but **not tested** — no user research from Vitesse Eco's actual sellers exists anywhere in the repo.

### Anchors from spec
- Target roles: `pm, gm, manager, seller`. Not `driver, stock_keeper`.
- 3 action types: `sale`, `purchase`, `expense`.
- Sellers' role-home is `/orders` (D-72 task-first). Voice is one path among several for order creation.

### Friction model (rough)
| Path | Time to enter a 2-item sale | Error profile |
|------|:---------------------------:|:-------------:|
| Keyboard form | ~30-45s | Typos on names; all fields controlled |
| Voice happy path | ~10-15s (record + review + save) | STT errors on dialect/noise; LLM misses fields |
| Voice with errors | ~40-60s (retry/correct) | Demoralising if frequent |

Voice pays off only if the happy-path rate is ~70% or higher. Below that, voice is slower than keyboard on average. This threshold is **unknown** for Vitesse Eco's dialect/noise profile.

### Market signal
- No French regulation requires voice (unlike D-35 invoice mentions).
- No SaaS competitor in retail ERP-lite treats voice as table-stakes.
- Differentiation potential exists; it's unproven for this specific workflow.

---

## 4. Groq cost (best-effort 2026 estimate)

Based on Groq's published 2025-2026 pricing; **please verify before pricing commitments**.

| Resource | Unit | Rate | Per 30s-audio voice request (~1200 in-tokens, ~200 out-tokens) |
|----------|------|:----:|:-----:|
| Whisper Large v3 | per hour of audio | ~$0.111 | ~$0.00093 |
| Llama 3.1 8B Instant — input | per 1M tokens | ~$0.05 | ~$0.00006 |
| Llama 3.1 8B Instant — output | per 1M tokens | ~$0.08 | ~$0.000016 |
| **Per request** | | | **~$0.001** |

### Volume scenarios
| Scenario | Req/day | Monthly | Annual |
|----------|:-------:|:-------:|:------:|
| Realistic SMB (6 sellers × 20/day) | 120 | ~$3.60 | ~$43 |
| Active use (6 × 50) | 300 | ~$9 | ~$108 |
| Rate-limit abuse ceiling (10 users × 10/min × 8h) | 48,000 | ~$1,440 | ~$17,280 |

The D-73 rate limit (10 req/min/user, DB-enforced) caps abuse. **Realistic monthly Groq spend: < €10.**

**Groq cost is not the blocker.** Engineering + maintenance is.

---

## 5. Latency + cold-start risk

Groq published + project-spec medians:
- Whisper large-v3 on 30s audio: ~1.5-2.0s.
- Llama 3.1 8B Instant inference: ~200-500ms.
- 5 parallel DB queries: ~120-200ms.
- Rate-limit roundtrip (D-73): 2 queries ≈ 250ms.

**Pipeline end-to-end**: ~2.5-3.5s steady-state. Acceptable because the user is reviewing a recording during the wait.

### Cold-start
- Vercel Functions with Fluid Compute (default since 2026) reuse instances across concurrent requests — the original D-33 cold-start concern is neutralised by D-73 anyway (DB-only rate limiter).
- First request after long idle: +500-1500ms for Node warm-up.
- Groq SDK bundle impact: ~50KB — negligible for cold-start, fits the 250MB function size budget comfortably.

### Mobile audio-capture risk (client-side)
- `MediaRecorder` support: iOS Safari 14.3+ (good), Android Chrome (good).
- Microphone permission denial needs a fallback (keyboard form stays available — acceptable).
- Field noise: `SILENCE_RMS_THRESHOLD = 0.02` per spec. Warehouse/street conditions could trigger false negatives or premature auto-stop.

**Latency is manageable; the mobile-audio UX is the hidden risk** — not testable without a real device fleet.

---

## 6. Maintenance burden

1. **LLM prompt drift** — Groq may deprecate `llama-3.1-8b-instant` or change outputs on minor updates. Requires a frozen regression suite of gold Arabic transcripts + expected extractions. Without it, silent accuracy decay is possible.
2. **Cache invalidation discipline** — D-34 hooks (`onProductChange`, `onClientChange`, `onSupplierChange`) must fire on every future write path. Adding a new write path without the hook = stale cache bug. Easy to miss in later tranches.
3. **Self-learning feedback loop** — `ai_corrections` + `ai_patterns` + `entity_aliases` need periodic analytics to detect "poisoned" patterns (a user systematically wrong, being "reinforced"). Needs a monitoring dashboard we haven't built.
4. **Dialect drift** — Arabic dialects vary (Shami/Khaliji/Masri/Maghribi). Prompt vocabulary (top 15 products + 20 clients + 10 suppliers) needs tuning as catalog/client base grows.
5. **Groq outage handling** — `groq_error` status is in the enum, but the client UX must degrade gracefully without leaving dangling DB rows.

### Testing cost
- Cannot call Groq in CI (cost + nondeterminism + auth). Needs a mocking layer that fakes Whisper + Llama outputs. New test scaffolding.
- Audio fixtures must be checked in (binary assets in git — workable).
- Client-side tests (MediaRecorder + Web Audio RMS) need JSDOM or Playwright. Neither is currently in vitest setup — adding Playwright is itself a multi-tranche project.

**Voice is the only ML-dependent feature.** Every other module is deterministic SQL + Drizzle. Bringing voice live means the support surface grows before production support baselines even exist.

---

## 7. Launch-blocker?

**No.** Per D-71:

> Deferred to post-MVP (Phases 4..6):
> - ❌ Voice input (Phase 5) — مع re-evaluation أولاً.

MVP status after Phase 5.3 (HEAD `4ed89a6`):
- ✅ Auth + 6 roles + DB-driven permissions (Phase 1)
- ✅ Clients + Products + Suppliers (Phase 2)
- ✅ Orders + cancellations (Phase 3)
- ✅ Preparation + delivery + collection (Phase 3)
- ✅ Invoice generation + PDF (Phase 4.1)
- ✅ Treasury + settlements + avoir (Phase 4.x)
- ✅ Notifications (Phase 5.1)
- ✅ Activity + Dashboard + Reports (Phase 5.2 + 5.3)

**Voice is categorically nice-to-have.** MVP can launch without it.

---

## 8. Options considered

### Option A — Ship Voice now

Scope: 3 tranches (5.4a pipeline + rate limit; 5.4b UI; 5.4c learn + aliases + cache hooks). Time: ~2-3 sessions. Risk: unverified UX hypothesis + €10/month Groq + new testing infrastructure + dialect-drift maintenance. Value: ~10-15s faster per sale in happy path.

### Option B — Defer Voice (chosen)

Skip 5.4 entirely. Proceed to 5.5 Polish (dark mode + empty states + printable invoice HTML + PWA icons + CI hardening) and declare MVP v1 complete. Voice becomes a post-launch tranche when real user demand is demonstrated.
- Engineering bandwidth saved: 2-3 tranches.
- Preservation: DB tables + spec + SDK + 7 decisions all intact. Re-activation = clean pick-up, not a rewrite.
- Risk: if a significant share of sellers request voice post-launch, we'd retrofit under time pressure — mitigated by Phase 5.5 including a feedback channel.

### Option C — Scope-down (Voice Minimal)

Ship only `POST /api/voice/process` + `VoiceButton` + `VoiceConfirm` + Groq wiring. Skip `/api/voice/learn`, `ai_patterns` writes, normalizer phases 3-4, entity cache invalidation. ~800-1,000 LOC. Risk: "naked" voice doesn't adapt; recurring errors → abandonment. Requires an amendment to 32_Voice_System.md + a new decision record. Half the engineering cost, but likely more than half the UX downside.

---

## 9. Recommendation — Option B (defer)

**Ranked justification**:
1. **D-71 binding directive**: voice was deferred with a re-evaluation gate. This is the re-evaluation; the honest answer is "value is unverified and MVP ships fine without it."
2. **Engineering cost vs value asymmetry**: ~2,850 LOC + new test infrastructure + dialect-drift maintenance for a feature whose user demand is hypothetical.
3. **Preservation is cheap**: schema + spec + SDK + decisions intact. Re-activating post-launch is a clean 3-tranche pick-up.
4. **Maintenance burden uniquely high**: voice is the only ML-dependent feature. Bringing it live pre-launch grows the support surface before production baselines exist.
5. **Phase 5.5 has clearer direct-day-1 value**: dark mode, empty states, printable invoice HTML, PWA, CI hardening — all known to matter.

---

## 10. Decision — accepted (2026-04-23)

Option B accepted. Documented as **D-83 — Voice Deferred Post-MVP** in `00_DECISIONS.md`. Re-activation trigger defined there.

### What this commit ships (docs-only)
- `00_DECISIONS.md` — new D-83 record.
- `32_Voice_System.md` — header status note ("Status: deferred post-MVP …"). Technical spec **unchanged**.
- `docs/phase-reports/phase-5.4-voice-re-evaluation.md` — this report.

### What this commit does NOT touch
- No `src/**` changes.
- No migrations.
- No tests added or removed.
- No dependency changes.
- Integration suite untouched (363/363 from Phase 5.3 holds).

### Gates run for this docs-only tranche
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm run build` — clean; route manifest unchanged.

No integration rerun needed — zero src delta vs. `4ed89a6`.

---

## 11. What unblocks voice in the future

When the three re-activation conditions in D-83 are met:
1. Re-validate Groq pricing and SDK version currency.
2. Verify the 4 DB schemas match post-launch reality (no migrations touched them, but adjacent schemas may have drifted).
3. Write a fresh Implementation Contract for Phase 5.4a (pipeline + rate limit), following Tranche Discipline Policy.
4. Decide whether the spec in `32_Voice_System.md` still holds as-is or needs amendments via a new decision record.
5. Ship 5.4a → 5.4b → 5.4c sequentially, each with its own D-78 report.

Until then, voice stays frozen exactly as documented.
