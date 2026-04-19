# Phase Delivery Reports

> **الغرض**: توثيق تسليم كل مرحلة برمجية (Phase 0..6) + أي PR كبير بدليل فعلي، تطبيقاً لـ **D-77** (مبدأ) و **D-78** (المواصفة الكاملة).
> **القاعدة الصارمة (D-78)**: لا تسليم يُقبَل بدون: (أ) 13-gate CI pack خضراء، (ب) Delivery Quality Report كامل، (ج) Post-Deploy Monitoring reports عند T+1h و T+24h إذا كان production deploy.

---

## ملفات هذا المجلد

### 1. تقارير التسليم (Delivery Reports)

اسم الملف: `phase-{N}-delivery-report.md`
- واحد لكل مرحلة برمجية (Phase 0..6).
- 13 section بالقالب الكنسي أدناه.

### 2. تقارير المراقبة بعد النشر (Monitoring Reports)

اسم الملف: `phase-{N}-monitoring-T+{X}h.md` (حيث X = 1 أو 24)
- إلزامي بعد كل production deploy.
- جدولة: T+1h (فحص سريع) + T+24h (تأكيد الاستقرار).

### 3. KPI Dashboard (مستمر)

اسم الملف: `kpi-dashboard.md`
- يُحدَّث بعد كل تسليم.
- يعرض الأهداف والقيم الحالية.

### 4. Hotfix Reports (عند الحاجة)

اسم الملف: `phase-{N}-hotfix-{N_hotfix}.md`
- يُكتَب عند اكتشاف عيب بعد إغلاق المرحلة.
- لا تعديل على تقارير التسليم الأصلية (snapshots تاريخية).

---

## القالب الكنسي — Delivery Quality Report (13 Section — D-78)

```markdown
# Phase {N} Delivery Report

## 1. Delivery ID
- Date: YYYY-MM-DD HH:mm (Europe/Paris)
- Branch: feature/...
- Commit SHA: {40-char sha}
- PR #: {number + link}

## 2. Scope
**What changed**: ... (صريح)
**What did NOT change**: ... (صريح — ليس افتراضياً)

## 3. Business Impact
(user-visible changes per role)
- seller: ...
- driver: ...
- stock_keeper: ...
- manager / gm / pm: ...

## 4. Technical Impact
- Files changed: N files (+X lines, -Y lines)
- Modules: list (e.g. `src/modules/orders`)
- Endpoints: list (v1 paths)
- Migrations: list (with names)
- DB tables affected: list

## 5. Risk Level
**Level**: low | medium | high
**Reason**: (explain why)

## 6. Tests Run
| # | Command | Result | Duration |
|---|---------|--------|----------|
| 1 | `npm ci` | ✅ | 42s |
| 2 | `npm run lint` | ✅ 0 errors | 8s |
| 3 | `npm run typecheck` | ✅ | 12s |
| 4 | `npm run build` | ✅ | 35s |
| 5 | `npm run test:unit` | ✅ 142/142 (coverage: 92% critical, 78% general) | 18s |
| 6 | `npm run test:integration` | ✅ 38/38 | 45s |
| 7 | `npm run openapi:drift` | ✅ 0 drift | 3s |
| 8 | `npm run db:migrate:check` | ✅ | 12s |
| 9 | `npm run test:authz` | ✅ 54/54 | 22s |
| 10 | `npm run test:regression` | ✅ 28/28 critical flows | 3m |
| 11 | `npm run test:e2e:smoke` | ✅ 5/5 golden paths | 4m |
| 12 | `npm run test:perf` | ✅ p95 within budget | 2m |
| 13 | `npm run test:a11y` + `test:logs` | ✅ 0 new issues + logs ok | 1m |

**CI run**: [github.com/.../runs/{id}]({full_link})

### Scope-Based Additional Tests (إذا تطلَّب النطاق)
| Command | Result |
|---------|--------|
| `npm run test:money:edge` | ✅ (تشغَّل لأن money logic تغيَّر) |

## 7. Regression Coverage (Permanent Pack — D-78)
- [✅] login/logout/session expiry/role resolution
- [✅] order create/edit/cancel/collect
- [✅] delivery assign/confirm/handover
- [✅] invoice generate/PDF/avoir
- [✅] treasury transfer/reconcile/settlements
- [✅] permission enforcement (6 × resource × action)
- [✅] idempotency on money-changing endpoints
- [✅] snapshots (invoice frozen + commission snapshot)
- [✅] soft-delete/soft-disable
- [✅] /api/v1/* backward compatibility
- [✅] Android-readiness (stable DTOs, SessionClaims abstraction)

## 8. API Impact
- Endpoints added: `/api/v1/...` (list)
- Endpoints changed: `/api/v1/...` (with DTO diff inline or link)
- Endpoints removed: none | list + reason
- Versioning impact: none | v1 extended (backward compat) | **breaking (requires v2 — REJECT delivery)**
- OpenAPI diff output: [link to openapi:drift output]

## 9. DB Impact
- Migrations: `0005_add_...sql` (up + down verified)
- New tables: list
- Altered tables: list with columns
- Data risk: none | low | medium | high (explain)
- **Rollback note (إلزامي)**: (خطوات استعادة صريحة إذا فشل الـ deploy)

## 10. Security Check
- Auth changes: none | (list)
- Permissions changes: none | (matrix diff)
- Secrets handling: N/A | (how — env vars, rotation)
- Destructive paths: N/A | (list + safeguards)
- npm audit: 0 critical/high
- PII masking: verified / N/A

## 11. Performance Check
- Endpoints added/changed: p95 before/after
  - `/api/v1/orders POST`: Xms → Yms (Δ Z%)
- Bundle size delta: +X KB gzipped
- Neon compute hours impact: +N hours/month estimate
- Blob storage impact: +N MB estimate

## 12. Known Issues
- Accepted limitations (honest): ...
- Tracked elsewhere: (links to issues / next phase scope)
- **ممنوع** إخفاء مشاكل معروفة هنا.

## 13. Decision
**Status**: ✅ ready | ⚠️ ready-with-conditions | ❌ not-ready
**Conditions** (if ready-with-conditions): ...
**Reviewer**: {name}
**Approved by**: {user "ابدأ" confirmation}
**Date**: YYYY-MM-DD HH:mm
```

---

## القالب الكنسي — Post-Delivery Monitoring Report (T+1h / T+24h)

```markdown
# Phase {N} Monitoring Report — T+{X}h

## Context
- Deployment time: YYYY-MM-DD HH:mm (Europe/Paris)
- Commit SHA: {sha}
- Environment: production
- Monitoring window: {deploy_time} → {deploy_time + Xh}

## Metrics (from Vercel + Sentry + Neon)

### Errors
- 5xx count: N
- 4xx count (excluding legitimate validation): N
- Top errors (if any):
  - `{error_code}`: N occurrences — `{endpoint}`

### Latency
- p95 per changed endpoint:
  | Endpoint | Baseline | Current | Δ |
  |----------|---------:|--------:|---|
  | `/api/v1/orders POST` | Yms | Xms | ±Z% |
  | ... | | | |

### Auth / Permissions
- Auth failures (401): N (baseline: M)
- Unexpected permission denials (403 where allow was expected): N
- Permission matrix anomalies: list | none

### DB
- DB errors: N
- Migration anomalies: none | (list)
- Slow queries (> 100ms): list | none
- Neon compute hours used (this deploy window): N

### Users
- User-reported issues: list (with links to tickets/messages) | none
- Help desk tickets opened: N

## Decision
**Status**: ✅ stable | ⚠️ watch | ❌ rollback candidate
**Reason**: ...
**Action**:
- [ ] continue monitoring (T+24h scheduled)
- [ ] escalate to team
- [ ] rollback to commit `{previous_sha}` (runbook: `docs/runbooks/rollback.md`)

**Reporter**: {name}
**Time**: YYYY-MM-DD HH:mm
```

---

## القالب الكنسي — KPI Dashboard

```markdown
# KPI Dashboard — Last Updated: YYYY-MM-DD

## Delivery Quality KPIs (D-78)

| مؤشر | الهدف | آخر 30 يوم | Trend |
|------|-------|-----------:|:-----:|
| Delivery pass rate | > 90% | X% | ⬆️/⬇️/➡️ |
| Build success rate | > 95% | X% | |
| Escaped bugs / delivery | → 0 | N | |
| Rollback count | 0 / rare | N | |
| Critical flow regression | 0 | N | |
| Auth/permission incidents | 0 | N | |
| Test flakiness rate | < 2% | X% | |

## Coverage (per last commit)
| Module category | Target | Actual |
|-----------------|-------:|-------:|
| Critical business | ≥ 90% branch | X% |
| General modules | ≥ 70% | X% |

## Performance KPIs
| Endpoint | p95 budget | p95 actual |
|----------|-----------:|-----------:|
| `/api/v1/orders GET` | 250ms | Xms |
| `/api/v1/orders POST` | 800ms | Xms |
| `/api/v1/deliveries/*/confirm` | 700ms | Xms |
| `/api/v1/invoices/*/pdf` | 2000ms | Xms |
| `/api/v1/voice/process` | 4000ms | Xms |

## Operational KPIs
| مؤشر | الهدف | الحالي |
|------|-------|--------|
| Neon compute hours / month | < 150h (of 190h) | Xh |
| Blob storage used | < 500 MB | X MB |
| Time to detect production issue | < 1h | X |
| Time to recover | < 2h | X |

## Failed Login / Abuse
| مؤشر | الهدف | الحالي |
|------|-------|--------|
| Failed login rate | < 2% of attempts | X% |
| Voice rate limit hits (429) | monitoring only | N/day |
| Idempotency conflicts (409) | monitoring only | N/day |
```

---

## التقارير المحفوظة

| # | Phase | الملف | التاريخ | CI Pass | Decision |
|---|-------|-------|---------|---------|----------|
| — | — | (أول تقرير عند تسليم Phase 0) | — | — | — |

---

## قواعد صارمة (D-78 enforcement)

1. **لا تعديل** على تقرير بعد حفظه (snapshot تاريخي). hotfix = تقرير جديد.
2. كل تقرير يجب أن يُشير لـ **CI run فعلي** على GitHub Actions (ليس screenshot).
3. **Evidence requirements** (D-78 §8):
   - قائمة الأوامر + pass/fail counts.
   - screenshots/recordings للـ UI changes.
   - OpenAPI diff output.
   - migration name + result.
   - coverage delta.
   - rollback note صريحة.
   - known-risk note صريحة.
4. `known gaps` **إلزامي** حتى لو فارغاً (يُكتَب صراحة "لا gaps في هذه المرحلة").
5. عبارات مثل "tested and works" أو "works on my machine" = **مرفوضة**.
6. **Enforcement**: `No delivery is accepted unless test evidence AND Delivery Quality Report are both submitted.`

---

**المراجع الكنسية**:
- [D-77 — Phase Delivery Gate (principle)](../requirements-analysis/00_DECISIONS.md#d-77-phase-delivery-gate-full-tests-evidence-report-لكل-مرحلة)
- [D-78 — Delivery Acceptance Framework (full spec)](../requirements-analysis/00_DECISIONS.md#d-78-delivery-acceptance-framework-13-gate-pack-13-section-report-post-deploy-monitoring-kpis)
- [D-75 — CI Gates (expanded to 13)](../requirements-analysis/00_DECISIONS.md#d-75-ci-gates-إلزامية)
