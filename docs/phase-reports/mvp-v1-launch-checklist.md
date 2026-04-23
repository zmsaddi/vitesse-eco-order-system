# MVP v1 — Launch Operational Checklist

> **Generated**: 2026-04-23 (Europe/Paris)
> **HEAD at generation**: `e3fe6a5` (Phase 5 Closure Pack + footer drift fix)
> **Purpose**: bridge between "Phase 5 accepted in code" and "production pilot live". Each section = concrete pre-/during-/post-deploy actions + acceptance criterion. Not a Phase 6 contract.
> **Owner**: Zakariya (operator) for ops actions; dev for code-side verification.
> **Not in scope**: any code change, any new feature. If a checklist item exposes a bug, open a tranche to fix it — do not wedge fixes into launch.

---

## 0. Go / No-go gate at the top

**Go criteria (all must be green before first production deploy)**:
1. HEAD at `e3fe6a5` (or a later docs-only/accepted commit), working tree clean.
2. Sections 1–4 green (env, Neon, admin bootstrap plan drafted, CI green on main).
3. Sections 5–8 executed on a staging environment (Neon `test2` or a fresh staging branch) end-to-end with no failures.
4. Section 9 rollback plan reviewed by Zakariya.
5. Section 10 T+1h monitoring plan ready (dashboards bookmarked, owner on-call for ~2h post-deploy).

**No-go triggers (any = stop, do not deploy)**:
- Working tree not clean.
- Any lint/typecheck/build/db:migrate:check/unit/integration gate red on main.
- Missing required env var at deploy time (see §1).
- No pre-launch Neon branch snapshot (see §2).
- No captured admin password (see §3).

---

## 1. Env / secrets — production

Validator: [`src/lib/env.ts`](../../src/lib/env.ts) — starts the app with `env()` which throws on any miss. Source of truth for names + constraints.

### Required (deploy fails without these)

| Var | Constraint | Source |
|-----|-----------|--------|
| `DATABASE_URL` | valid URL | Neon production branch connection string (pooled recommended) |
| `NEXTAUTH_SECRET` | string min 32 chars | `openssl rand -base64 48` |

### Strongly recommended

| Var | Constraint | Notes |
|-----|-----------|-------|
| `NEXTAUTH_URL` | valid URL | production domain, e.g. `https://vitesse-eco.vercel.app`. Required for NextAuth callbacks to route correctly. |
| `INIT_BOOTSTRAP_SECRET` | string min 16 chars | Gates `POST /api/init`. Set only for the first-admin bootstrap, then UNSET (see §3). |
| `BLOB_READ_WRITE_TOKEN` | string | Vercel Blob token for PDF cache (D-56). Without it, PDFs are re-rendered on every request instead of cached. |

### Optional (leave unset unless feature is active)

| Var | Reason to skip | Activation path |
|-----|----------------|-----------------|
| `GROQ_API_KEY` | Voice deferred per D-83 | Unset until voice is re-activated. |
| `CRON_SECRET` | Cron endpoints NOT shipped | Unset until `/api/cron/*` is implemented (see §Known gaps). |
| `BACKUP_ENCRYPTION_KEY` | Manual export only in MVP | Set when automated encrypted backups ship. |
| `ALLOW_DB_RESET` | Production-forbidden | `env.ts` L49–51 throws if `ALLOW_DB_RESET=true` + `NODE_ENV=production`. Leave unset. |

### Vercel-specific

- Set `NODE_ENV=production` (Vercel does this automatically on production branch deploys).
- Add each required var via Vercel Dashboard → Project → Settings → Environment Variables → scope = **Production**.
- Preview deployments: either mirror the production vars (dangerous — same DB) **or** point `DATABASE_URL` to a preview Neon branch. **Strong recommendation**: preview = its own branch.

### Acceptance

- After adding vars, trigger a production deploy.
- Vercel build logs show no "`env validation failed`" error.
- Visiting `/api/health` returns 200 JSON.

---

## 2. Neon branch / backup / migration verification

### Current branch inventory (project `odd-thunder-46754024`)

| Branch | ID | Role | Post-launch action |
|--------|-----|------|--------------------|
| `main` | `br-wandering-union-alejq4g7` | **Production target** — wire `DATABASE_URL` to this | Keep; never delete |
| `test` | `br-green-math-alktfoz4` | Legacy CI branch, WebSocket-throttled during 5.1b | **Delete** after launch: `neonctl branches delete test --project-id odd-thunder-46754024` |
| `test2` | `br-proud-hall-al8h8v8i` | CI integration target (green 372/372 on `96971e8`) | **Keep** for CI; rename if desired |

### Pre-launch backup

1. Snapshot `main` **before** any migration:
   ```bash
   neonctl branches create --project-id odd-thunder-46754024 \
     --name pre-launch-backup-$(date +%Y%m%d) --parent main
   ```
2. Record the branch ID + creation timestamp in this checklist's §9 rollback plan.
3. Keep this branch read-only until 7 days post-launch without incident, then delete.

### Migrations (13 files, 0000 → 0012)

```
0000_initial_schema.sql
0001_immutable_audits.sql
0002_permissions_unique.sql
0003_clients_dedup_indexes.sql
0004_suppliers_dedup_indexes.sql
0005_expenses_reversal_of.sql
0006_order_items_discount.sql
0007_invoice_frozen_snapshots.sql
0008_invoice_lines_hash_chain.sql
0009_users_manager_id.sql
0010_manager_box_under_main_cash.sql
0011_settlements_applied_tracking.sql
0012_notification_preferences_unique.sql
```

### Migration dry-run + apply

```bash
# 1. Sanity: schema/migrations consistent
npm run db:migrate:check

# 2. Point at production (one-time). DATABASE_URL here is the Neon main
#    branch connection string. Use the CLI locally, not in CI.
DATABASE_URL="<prod neon main url>" npm run db:migrate

# 3. Verify: compare table list against 02_DB_Tree.md. No missing tables,
#    no extra tables.
```

### Acceptance

- `db:migrate:check` says "Everything's fine 🐶🔥".
- `db:migrate` reports every migration in `src/db/migrations/*.sql` applied exactly once.
- `SELECT COUNT(*) FROM users WHERE username='admin'` = 0 **before** §3 bootstrap.

---

## 3. Admin bootstrap

Flow — **exactly once** per environment. Do not re-run.

1. **Set `INIT_BOOTSTRAP_SECRET`** (random 16+ chars) in Vercel env vars. Scope = Production.
2. **Redeploy** so the new var is live.
3. **Call `POST /api/init` with the secret**:
   ```bash
   curl -X POST https://<prod-domain>/api/init \
     -H "x-init-secret: $INIT_BOOTSTRAP_SECRET" \
     -H "content-type: application/json"
   ```
4. **Capture the admin password** from the response (field: `adminPassword`). The response body contains the password **exactly once**; subsequent POSTs return 409 `ALREADY_INITIALIZED` without a password.
5. **Store the password immediately** in a password manager (1Password / Bitwarden). If you lose it, recovery requires direct DB access to update `users.password` with a new bcrypt hash — painful.
6. **Log in** as `admin` via the login page. On first login, the UI will treat this user as "onboarded_at IS NULL" (D-49) — no modal in MVP, just normal login.
7. **Change the admin password** immediately via `/users/[id]/edit` → new strong password (≥ 16 chars, mixed).
8. **UNSET `INIT_BOOTSTRAP_SECRET`** in Vercel. Redeploy. Endpoint now returns 503 `INIT_DISABLED` — no one can re-trigger the bootstrap.

### Acceptance

- Able to log in as `admin` with the captured password.
- `GET /api/v1/me` returns `{ claims.role: "pm" }` (admin is seeded as pm).
- `POST /api/init` now returns 503.

---

## 4. CI status

### Workflow file: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

### 14-gate pack (13 quality gates + 1 non-blocking audit, per D-78)

| # | Gate | Script | Status |
|---|------|--------|:------:|
| 0 | `.nvmrc ⇔ engines.node` | `node scripts/verify-nvmrc.mjs` | ✅ real |
| 1 | Lockfile (`npm ci`) | `npm ci` | ✅ real |
| 2 | Lint (ESLint + max-lines 300) | `npm run lint` | ✅ real |
| 3 | Typecheck | `npm run typecheck` | ✅ real |
| 4 | Build | `npm run build` | ✅ real |
| 5 | Unit tests + coverage | `npm run test:unit` | ✅ real (254/254 on HEAD, coverage ≥ 70%) |
| 6 | Integration tests | `npm run test:integration` | ✅ real on `test2` branch (372/372 on `96971e8`) |
| 7 | OpenAPI drift | `npm run openapi:drift` | ⏸️ placeholder (exits 0 — no-op script) |
| 8 | Migration check | `npm run db:migrate:check` | ✅ real |
| 9 | Authorization tests | `npm run test:authz` | ✅ real but `tests/authz/` directory is empty — pass-no-tests |
| 10 | Regression pack | `npm run test:regression` | ✅ real but `tests/regression/` is empty — pass-no-tests |
| 11 | E2E smoke (Playwright) | `npm run test:e2e:smoke` | ⏸️ placeholder |
| 12 | Performance smoke | `npm run test:perf` | ⏸️ placeholder |
| 13a/b | a11y + logging smoke | `npm run test:a11y` + `npm run test:logs` | ⏸️ placeholders |
| audit | `npm audit` (non-blocking) | separate job | ✅ real |

### CI secrets (repo → Settings → Secrets and variables → Actions)

See [`docs/CI_SECRETS.md`](../CI_SECRETS.md) for the authoritative list. Minimum for meaningful CI signal:

- `TEST_DATABASE_URL` — Neon `test2` branch connection string (or any ephemeral Postgres that tolerates `DROP SCHEMA public CASCADE`).
- `NEXTAUTH_SECRET` — 32+ chars. A CI fallback exists but using a real value avoids "pass for wrong reason".

### Acceptance

- Latest run on `main` shows all real gates green (placeholders obviously exit 0).
- `audit` job might show advisories; review them but don't gate merge on them.
- Branch protection on `main`: require status checks = `quality` job, require up-to-date branches.

---

## 5. Smoke test accounts

Create one user per operational role from the admin account, recording their passwords in the password manager.

| Role | Suggested username | Links via `users.manager_id`? | Recorded password? |
|------|--------------------|:---------------------------:|:------------------:|
| pm | `admin` (already exists) | — | from §3 step 4 |
| gm | `gm-smoke` | — | ☐ |
| manager | `mgr-smoke` | — | ☐ |
| seller | `sel-smoke` | no (schema reality: `manager_id` only on drivers) | ☐ |
| driver | `drv-smoke` | ✅ `manager_id = mgr-smoke.id` | ☐ |
| stock_keeper | `sk-smoke` | — | ☐ |

### Creation steps (per user)

1. Log in as admin → `/users/new`.
2. Fill username + role + name; submit.
3. Reset password → record in password manager.
4. Log in as that user in a fresh incognito window.

### Acceptance (per role)

- Login succeeds.
- Post-login redirect matches **D-72 role-home**:
  - pm / gm / manager → `/action-hub`
  - seller → `/orders`
  - driver → `/driver-tasks`
  - stock_keeper → `/preparation`
- Sidebar nav matches the role's entries in [`nav-items.ts`](../../src/components/layout/nav-items.ts).
- The theme toggle in the topbar cycles system → light → dark → system; the bell icon renders with the correct initial unread count (should be 0 for a fresh user).

---

## 6. Invoice / PDF / print smoke

### Pre-req (one-time, run as pm)

Settings keys required by D-35 invoice readiness must all be non-empty:

```
shop_name, shop_legal_form, shop_address, shop_city, shop_siret,
shop_siren, shop_ape, shop_vat_number, shop_rcs_number,
shop_capital_social, shop_iban, shop_bic, shop_penalty_rate_annual,
shop_recovery_fee_eur, vat_rate
```

Fill via `/settings`. The banner at the top turns from amber ("D-35 mandatory mentions missing…") to green when complete.

### Flow

1. As `sel-smoke`: create an order with two items, `paymentMethod='كاش'`, for a seed client.
2. As `admin`: transition order to `قيد التحضير` via `/action-hub` or direct API.
3. As `admin`: mark order `جاهز` (same path).
4. As `admin`: create a delivery via `/deliveries` → assign to `drv-smoke`.
5. As `drv-smoke`: start + confirm delivery with `paidAmount` = order total.
6. Note the `invoiceId` returned from the confirm.
7. Hit `GET /api/v1/invoices/[invoiceId]`: response contains `invoice.vendorSnapshot` + `invoice_lines[]` + frozen totals.
8. Hit `GET /api/v1/invoices/[invoiceId]/pdf` in a browser tab — the pdfkit PDF renders with **all** D-35 mentions + stamp.png (if seeded) + hash chain fields populated.
9. Visit `/invoices/[invoiceId]/print` — browser-print HTML view. Press Ctrl+P / Cmd+P → the print preview shows clean A4 layout (no sidebar/topbar) with identical D-35 content.

### Acceptance

- Both PDF + HTML print render without error.
- SIRET, SIREN, APE, N° TVA all visible.
- "FACTURE" title (not "AVOIR" — parent invoice).
- Payment method label in French: "Espèces / À la livraison".
- Hash chain: `verifyActivityLogChain` + `verifyInvoicesChain` + `verifyInvoiceLinesChain` all return `null` post-flow (run via a read-only admin SQL tool or a Drizzle helper).

---

## 7. Order-to-cash smoke

Extends §6 — re-uses the same order + delivery. Checkpoints:

| Checkpoint | Expected |
|------------|----------|
| Order ref code | `ORD-YYYYMMDD-NNNNN` (e.g. `ORD-20260501-00001`) |
| Order status transitions | `محجوز → قيد التحضير → جاهز → مؤكد` in that order |
| `orders.delivery_date` | = today (Paris), written at confirm (D-35 + Phase 4.0.2) |
| `orders.confirmation_date` | = confirm timestamp (timestamptz) |
| Invoice ref code | `FAC-YYYY-MM-NNNN` (monthly counter) |
| `invoices.total_ttc_frozen` | = sum of `order_items.line_total` where `is_gift = false` |
| Payment row | `payments.type='collection'`, `amount = paidAmount`, signed |
| Bonus rows | 1 seller row per non-gift order_item + 1 driver row per delivery |
| `X-Unread-Count` header | present on every authenticated response (D-42) |

### Acceptance

- Every checkpoint passes.
- Notifications arrive for the expected audiences (ORDER_CREATED to pm/gm/manager/stock_keeper; DELIVERY_CONFIRMED to pm/gm/manager + seller; PAYMENT_RECEIVED to pm/gm/manager; BONUS_CREATED to the seller + driver).

---

## 8. Treasury / settlement smoke

### Setup (one-time, as pm)

- `/treasury` shows one `main_cash` account pre-seeded.
- Create a `main_bank` account via the treasury page or direct SQL insert.
- The `mgr-smoke` manager's `manager_box` should already exist from `wireManagerAndDrivers` equivalent — if not, create via admin.
- The `drv-smoke` driver's `driver_custody` should be a child of `mgr-smoke`'s `manager_box` (BR-52 hierarchy) — verify via `/treasury` tree view.

### Flow

1. **Collection at confirm (from §6)** — the `paidAmount=كاش` already seeded `drv-smoke`'s `driver_custody` via the BR-55 bridge.
2. **Driver handover**: as `drv-smoke`, `POST /api/v1/treasury/handover { amount: <full custody> }`. Funds move `driver_custody → manager_box`. Verify balances on `/treasury`.
3. **Manager settlement**: as pm, `POST /api/v1/treasury/transfer { fromAccountId: <mgr-smoke manager_box>, toAccountId: <main_cash>, amount, ... }`. `category='manager_settlement'`.
4. **Reconciliation**: as pm, `POST /api/v1/treasury/reconcile { accountId: <main_cash>, actualBalance: <count the cash> }`. If diff ≠ 0, a `reconciliation` movement row appears.
5. **Seller settlement**: as pm, `POST /api/v1/settlements { kind: "settlement", userId: sel-smoke.id, bonusIds: [...], fromAccountId: main_cash.id, paymentMethod: "كاش" }`. bonuses → `status='settled'`.
6. **Reward**: as pm, `POST /api/v1/settlements { kind: "reward", userId: sel-smoke.id, amount: 20.00, fromAccountId: main_cash.id, paymentMethod: "كاش" }`. A `settlements` row with `type='reward'` + `treasury_movement` category='reward'.
7. **Cancel-as-debt** (optional): create a second order, confirm with paid, then cancel with `sellerBonusAction='cancel_as_debt'`. A negative `settlements` row appears with `type='debt'`. Next `settlement` call for that seller auto-consumes it via `applied_in_settlement_id` (BR-55 debt consumption).

### Acceptance

- All endpoints return 200.
- Treasury balances reconcile: `main_cash + main_bank + Σ manager_boxes + Σ driver_custodies` = sum of all `payments.amount` (collected) − settlements paid out.
- `activity_log` chain intact after all flows (`verifyActivityLogChain` returns null).
- `/my-bonus` as `sel-smoke` shows the expected `availableCredit` + settlement history.

---

## 9. Rollback plan

### Pre-deploy

- Branch snapshot from §2 captured: `pre-launch-backup-<date>`, ID `br-...` (fill in).
- Previous Vercel deployment URL recorded (Vercel keeps old deployments reachable).

### Rollback decision tree

| Symptom | Action | Severity |
|---------|--------|:--------:|
| Build failure on deploy | Vercel deploys only succeed → no bad build reaches prod. Fix + redeploy. | Low |
| Runtime 500s on `/api/*` | Vercel Dashboard → Deployments → Previous → Promote to Production. Investigate logs. | High |
| Auth broken (NextAuth callback loop) | Check `NEXTAUTH_URL` matches domain exactly. Redeploy or patch env + redeploy. | High |
| Schema drift between code + DB | Harder. Two paths: (a) roll code back to previous commit; (b) apply compensating SQL manually via Neon SQL editor. Never re-run migrations to "downgrade" — our migrations are additive. | Critical |
| Data corruption or bad migration | Restore from `pre-launch-backup-<date>`: point `DATABASE_URL` at it (Neon Dashboard → branch → connection string). Old branch becomes the new prod until a fresh migration is prepared. | Critical |
| `/api/health` returns non-200 | Immediate promotion-rollback while you diagnose. 5-minute rule: if prod is red and you don't have a clear fix in 5 minutes, roll back first, diagnose second. | High |

### Post-rollback

1. Document what failed in a post-mortem file under `docs/phase-reports/`.
2. Identify the offending commit (git bisect if needed).
3. Open a fix tranche with Contract + Self-Review + gates before re-deploying.

---

## 10. T+1h / T+24h monitoring (per D-78)

### T+1h checks (operator on-call for ~2h)

| Check | Tool | Acceptance |
|-------|------|------------|
| Vercel function errors | Vercel Dashboard → Project → Logs | Error rate < 1% of requests |
| P95 latency | Vercel Dashboard → Analytics | P95 < 2s for `/api/v1/*` |
| Neon compute hours | Neon Console → Monitoring | < 5 CU-hours in the last hour (Free tier ceiling context) |
| Neon connection count | Neon Console | No saturated pool warnings |
| `/api/health` on prod | `curl https://<prod>/api/health` | 200 OK |
| Smoke login flow | Browse as `sel-smoke` in incognito | Login + order list load in < 3s |
| `X-Unread-Count` header | DevTools → Network on any authenticated page | Header present, numeric value |
| Theme toggle + PWA install | Chrome DevTools → Application → Manifest | Manifest valid, icons resolve, SW registered |

### T+24h checks

| Check | Tool | Acceptance |
|-------|------|------------|
| Activity log chain integrity | Ad-hoc admin query: `SELECT verifyActivityLogChain(tx)` via Drizzle | Returns `null` |
| Invoice chain integrity | `verifyInvoicesChain` + `verifyInvoiceLinesChain` | Both return `null` |
| Order count vs plan | `SELECT COUNT(*) FROM orders WHERE created_at > NOW() - interval '24h'` | Matches expected pilot volume |
| Payment reconciliation | Manual: sum payments, compare to treasury balances | Matches within €0.01 tolerance |
| Notification emission | `SELECT type, COUNT(*) FROM notifications WHERE created_at > NOW() - interval '24h' GROUP BY type` | Expected events fire for pilot activity |
| Neon slow-query log | Neon Console → Queries | No queries > 500ms on the hot path |
| Error rate | Vercel Logs 24h | Still < 1% |
| No schema drift | `npm run db:migrate:check` against prod DATABASE_URL | "Everything's fine" |
| Admin password still captured | Operator verifies password manager entry | Recoverable |

### Escalation

- Any T+1h check red → investigate immediately.
- Any T+24h check red → open a remediation tranche; don't accept pilot as "complete" until root-caused.

---

## Known gaps (documented, non-blocking for launch — but planners should know)

1. **Cron endpoints NOT implemented** (`src/app/api/cron/*` doesn't exist). Impact:
   - **Notifications retention**: read notifications accumulate forever. Impact is bounded — `notifications` is a narrow table. Manual SQL cleanup is trivial: `DELETE FROM notifications WHERE read_at < NOW() - INTERVAL '60 days'`.
   - **Overdue payment auto-flip**: `payment_schedule.status` stays at last-written value. No automated "overdue" flip.
   - **Reconciliation daily reminder**: `RECONCILIATION_REMINDER` notification event defined but no emitter — operator runs reconciliation manually.
   - **Voice rate-limit prune**: N/A (voice deferred per D-83).
   - **Mitigation**: schedule a weekly operator cron (server-side cron, Neon triggers, or a cheap Vercel cron job in Phase 6) to run the retention DELETE + overdue flip.
2. **GIFT_POOL_FILLED, OVERDUE_PAYMENT, RECONCILIATION_REMINDER notification events** — routing + preference rows exist; no live emitter (documented Known Gap in Phase 5.1a report).
3. **Voice system** — deferred post-MVP per D-83. `groq-sdk` is installed but unused; safe to leave.
4. **PWA has no offline data sync** — intentional per D-84. Offline navigation shows `/offline` page; editing requires network.
5. **E2E / a11y / perf automation** — CI placeholders only. Manual testing covers MVP launch.
6. **Permissions UI** — `/permissions` matrix is Phase 6. Today: permissions row edits require direct SQL.

---

## Handoff

Once all 10 sections are green + known gaps acknowledged:

- **Zakariya**: pick production deploy moment; keep on-call for T+1h.
- **Dev (me)**: available for emergency fix tranches under Tranche Discipline Policy.
- **Phase 6**: remains gated on your explicit open. Suggested priority order (no commitment):
  1. `/api/cron/*` implementation (closes the cron gap above).
  2. `/permissions` UI (closes the direct-SQL-for-role-edits gap).
  3. `/distributions` (profit distribution workflow).
  4. Command Palette (Ctrl+K) — polish.
  5. Voice re-evaluation (if user demand surfaces per D-83).

---

## Sign-off

- [ ] §1 Env / secrets verified in Vercel (initials + date)
- [ ] §2 Neon backup branch created (branch ID, date)
- [ ] §3 Admin password captured + `INIT_BOOTSTRAP_SECRET` unset
- [ ] §4 CI green on main
- [ ] §5 All 6 role accounts exist and log in correctly
- [ ] §6 Invoice PDF + HTML print both render with D-35 mentions
- [ ] §7 Order-to-cash end-to-end passes
- [ ] §8 Treasury + settlements flows pass, balances reconcile
- [ ] §9 Rollback plan reviewed; Vercel previous-deployment URL + Neon backup branch ID recorded
- [ ] §10 T+1h dashboards bookmarked; operator on-call window scheduled

When every box is checked → production pilot deploy.
