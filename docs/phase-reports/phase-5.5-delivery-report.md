# Phase 5.5 Delivery Report — Polish

> **Template**: D-78 §5 (13-section).
> **Type**: Final MVP-v1 polish tranche. Dark mode + empty states + printable invoice HTML + PWA minimal + CI hardening. Zero migrations, zero API mutations, zero write-path changes, zero new runtime dependencies.

---

## 0. Implementation Contract (accepted 2026-04-23 with 5 amendments)

All five reviewer amendments honored:
1. **Tailwind v4 class-based dark variant** — `@custom-variant dark (&:where(.dark, .dark *));` in `src/app/globals.css`. Not media-only.
2. **`/offline` route added** — `src/app/offline/page.tsx` (static fallback served by the SW when navigation fails).
3. **`.nvmrc` consistency check (no Node bump)** — `scripts/verify-nvmrc.mjs` validates `.nvmrc` major matches `package.json` engines.node major; the CI workflow uses `node-version-file: .nvmrc`. No version moves.
4. **No `sharp` as runtime or devDependency** — one-shot generator script `scripts/generate-pwa-icons.mjs` uses `sharp` resolved transitively from Next 16's image pipeline. The two committed PNGs (192 + 512 maskable) are the only artifacts needed at runtime.
5. **Print tests avoid fake page-HTTP coverage** — integration tests target `GET /api/v1/invoices/[id]` (the endpoint the print page consumes) and a direct server-render smoke on `<PrintableInvoice>`. No fake "page route" HTTP test is claimed.

---

## 1. Delivery ID

- **Date**: 2026-04-23 (Europe/Paris)
- **Base commit**: `4436d1d` (Phase 5.4 — Voice deferred post-MVP)
- **Commit SHA (delivery)**: *(appended at commit time)*
- **Phase**: **5.5 — Polish (dark mode + empty states + printable invoice + PWA + CI hardening)**

---

## 2. Scope

### In-scope
- **Dark mode**: hand-rolled 3-way toggle (system / light / dark) + `@custom-variant dark` in globals.css + no-flash inline script + `<html class="dark">` toggling via `useSyncExternalStore` + `localStorage['vitesse-theme']`.
- **Empty states**: existing `<EmptyState>` component is kept; added empty-row handling to 4 report tables in `reports/[slug]/table-renderers.tsx` (top-clients, top-products, expenses-by-category, bonuses-by-user) — previously silently-empty `<tbody>`.
- **Printable invoice HTML**: `/invoices/[id]/print` (server component + `PrintableInvoice` component). Parallel channel to the existing pdfkit PDF route; same D-35 legal content from frozen JSONB; browser-print via `@media print` in globals.css.
- **PWA minimal**: manifest.webmanifest + sw.js (vanilla, ~80 LOC) + ServiceWorkerRegister client + 2 PNG icons (committed) + `/offline` static fallback. No Workbox, no offline data sync, no push.
- **CI hardening** (narrow): `.next/cache` caching step + `.nvmrc ⇔ engines.node` consistency check + non-blocking `npm audit` job + `node-version-file: .nvmrc` in setup-node.

### Not touched (verified by diff)
- No `src/db/**` — no migrations.
- No `src/app/api/**` — zero new endpoints, zero changes to existing.
- No `src/modules/**` business-logic write paths — print consumes existing `GET /api/v1/invoices/[id]` read service.
- No new runtime dependency. Amendment #4 honored.
- Phase 5.4 voice — defer (D-83) unchanged.

---

## 3. Files

### New (18)

| File | Role | Lines |
|------|------|:----:|
| `src/components/theme/resolve-theme.ts` | Pure theme resolution helpers (readStored / resolveTheme / nextTheme + storage-error-safe) | 41 |
| `src/components/theme/resolve-theme.test.ts` | Unit tests — 8 cases | 61 |
| `src/components/theme/ThemeProvider.tsx` | Client provider; `useSyncExternalStore` for prefers-color-scheme; lazy-init from localStorage | 99 |
| `src/components/theme/ThemeToggle.tsx` | 3-way toggle button in Topbar with inline SVG icons | 82 |
| `src/components/theme/no-flash-script.ts` | String constant of inline `<head>` script; prevents first-paint flash | 31 |
| `src/components/pwa/ServiceWorkerRegister.tsx` | Client-only SW register, production-gated | 27 |
| `src/components/pwa/manifest.test.ts` | Manifest shape-sanity unit — 6 assertions | 50 |
| `src/app/offline/page.tsx` | Static fallback page served by SW on navigation failure | 34 |
| `src/app/(app)/invoices/[id]/print/page.tsx` | Server component — canonical fetch + print chrome note + print button | 86 |
| `src/app/(app)/invoices/[id]/print/PrintableInvoice.tsx` | Server-rendered HTML invoice with D-35 French mentions | 246 |
| `public/manifest.webmanifest` | PWA install manifest | 23 |
| `public/sw.js` | Service worker (vanilla, app-shell only) | 80 |
| `public/icons/icon-source.svg` | Canonical 512×512 SVG icon source | 10 |
| `public/icons/icon-192.png` | Standard PWA icon, committed | binary |
| `public/icons/icon-512-maskable.png` | Maskable PWA icon, committed | binary |
| `scripts/generate-pwa-icons.mjs` | One-shot SVG→PNG generator using transitively-resolved `sharp` | 26 |
| `scripts/verify-nvmrc.mjs` | CI Gate 0 — `.nvmrc` major vs `engines.node` minimum | 30 |
| `docs/CI_SECRETS.md` | Documentation of required + intentionally-absent CI secrets | 30 |
| `tests/integration/phase-5.5-polish.test.tsx` | 9 integration cases (8 endpoint-permissions + 1 PrintableInvoice render smoke + 1 chain integrity) | 466 |
| `docs/phase-reports/phase-5.5-delivery-report.md` | This report | — |

All `src/` files ≤ 300 lines per rule; test file exempt per eslint config scope.

### Modified (6)

| File | Change |
|------|--------|
| `src/app/globals.css` | Adds `@custom-variant dark` + `@media print` chunk (hides `.no-print`, forces ltr on `.print-invoice`, A4 margins) |
| `src/app/layout.tsx` | Inlines no-flash script in `<head>`, wraps children in `<ThemeProvider>`, declares `manifest` metadata + `viewport.themeColor` |
| `src/app/(app)/layout.tsx` | Mounts `<ServiceWorkerRegister />` once under Providers (production-only registration) |
| `src/components/layout/Topbar.tsx` | Mounts `<ThemeToggle />` beside the BellDropdown |
| `src/app/(app)/reports/[slug]/table-renderers.tsx` | Empty-row handling for 4 previously-silent report tables (top-clients-by-debt, top-products-by-revenue, expenses-by-category, bonuses-by-user) |
| `.github/workflows/ci.yml` | `.nvmrc` consistency Gate 0, `.next/cache` restore step, `node-version-file: .nvmrc`, new non-blocking `audit` job |
| `vitest.config.ts` | `.tsx` test-file inclusion (`src/**/*.test.{ts,tsx}` + `tests/**/*.test.{ts,tsx}`) + tsx exclusion from coverage |
| `docs/requirements-analysis/22_Print_Export.md` | New "قناتا طباعة متوازيتان" section describing PDF vs HTML print |
| `docs/requirements-analysis/18_Screens_Pages.md` | Rows 28 (`/invoices/[id]/print`) + 29 (`/offline`) added |
| `docs/requirements-analysis/38_Accessibility_UX_Conventions.md` | Header note on Tailwind v4 dark-variant reality + ThemeProvider |
| `docs/requirements-analysis/00_DECISIONS.md` | New **D-84 — PWA Minimal Scope** |

---

## 4. Dependencies

**Zero new runtime or dev dependencies in `package.json`.**

The icon generator script uses `sharp` resolved transitively via Next 16's image pipeline. If that transitive dependency ever disappears, the script emits a clear error; the PNGs are already committed, so runtime is unaffected. Per amendment #4, I did not add `sharp` as a dep and did not ship without verifying availability.

---

## 5. Integration Points

- **Dark mode ↔ existing pages**: hundreds of `dark:` Tailwind utilities are already scattered across the codebase; the custom variant makes them class-reactive. No page changed.
- **Theme toggle ↔ Topbar**: mounted once; persists via localStorage; `useSyncExternalStore` subscribes to `matchMedia("(prefers-color-scheme: dark)")` for the `system` case.
- **No-flash script**: inline in `<head>` before hydration → avoids the dark→light (or light→dark) flash that would otherwise happen on every first paint.
- **Print HTML ↔ PDF**: parallel channels on the same frozen data. Users pick their channel. No shared code path changes.
- **SW ↔ authenticated data**: the fetch handler skips `/api/*` and `/auth/*` entirely. No risk of stale / cross-user caching. Only static app shell + `/offline` are cached.
- **CI**: `.nvmrc` check runs as Gate 0 (fastest possible fail on version drift). `.next/cache` caching accelerates builds without touching behavior. `audit` runs in parallel, non-blocking.

---

## 6. Tests Run (Local — 2026-04-23)

### 6-gate status

| # | Gate | Result |
|---|------|:-:|
| Lint | ✅ exit 0 (pre-existing `managerBId` unused-var warning on 5.3 test unchanged; not introduced by this tranche) |
| Typecheck | ✅ clean |
| Build | ✅ `/invoices/[id]/print` + `/offline` present in route manifest |
| db:migrate:check | ✅ clean — no schema touch |
| Unit | ✅ **254/254** (240 baseline + 14 new from theme + manifest tests). Coverage 75.19% / 82.89% / 89.53% / 75% — all above 70% thresholds |
| Integration | ✅ real, live Neon | **372/372 passed** (36 files, 673s ≈ 11min) on `test2`. 363 baseline + 9 new = 372 actual. Log: `/tmp/vitesse-logs/full-5.5.log`. |

### Manual UI disclosure (CLAUDE.md)

Same environment constraint as 5.1b/5.2/5.3: no browser automation in this session; no `DATABASE_URL` for `next dev`. Compile + integration + unit coverage is real; interactive browser verification deferred to reviewer.

What to eyeball after commit:
- Theme toggle: click cycles system → light → dark → system. Reload preserves choice. No flash on first paint.
- `/invoices/[id]/print`: renders in Arabic RTL with a French invoice inside a `.print-invoice` block. Ctrl+P produces a clean A4 page without topbar/sidebar.
- DevTools → Application → Manifest: name, icons, theme color visible.
- DevTools → Application → Service Workers: registered in production build only (not dev).
- `/offline` displays when the browser is offline + cache miss.
- Empty report filters (e.g. `dateFrom` in the future): table shows a centered empty row, not a silent gap.

---

## 7. Regression Coverage

- 363 pre-5.5 integration cases remain valid; 5.5 introduces 9 new cases (372 total expected).
- No API endpoint changed; no business-logic file changed.
- PrintableInvoice render is asserted on the same frozen-data contract that the PDF route uses.
- T-POLISH-CHAIN-INTACT-AFTER-READS preserves the hash-chain integrity pattern from 5.2 / 5.3.

---

## 8. API Impact

**None.** No new endpoints. No changes to existing.

---

## 9. DB Impact

**None.** No migrations, no schema changes, no new columns or indexes. The print page reads via the existing canonical `GET /api/v1/invoices/[id]` endpoint.

---

## 10. Security Check

- **SW never caches authenticated data**: fetch handler skips `/api/*` and `/auth/*` before any cache interaction. Only `/offline` + `/manifest.webmanifest` + `/icons/*` + `/_next/static/*` + `/fonts/*` may hit the cache. Verified by inspection of `sw.js`.
- **SW registration is production-only**: dev builds don't register the worker, avoiding local test pollution.
- **Print page re-uses existing role enforcement**: `/api/v1/invoices/[id]` service already enforces pm/gm/manager/seller-own/driver-assigned/stock_keeper-403. The print page inherits this via canonical fetch; no second role layer is introduced.
- **No new server-side trust boundary**: print HTML is a rendering view over data the user can already legitimately GET. Access control is unchanged.
- **No user input flows into Arabic→French transform**: every French string in `PrintableInvoice` comes from `vendorSnapshot` (frozen at issue) or is a static label. SIRET/IBAN/etc. are not user-input-derived at render time.
- **Manifest + icons are static files**: no dynamic generation; no SSRF surface.
- **No new npm dependency** (amendment #4): the PWA install-prompt is as trustworthy as the committed bytes.

---

## 11. Performance Check

- Dark mode: zero runtime cost beyond `useSyncExternalStore` subscribing to one `MediaQueryList`. Class toggle is O(1).
- No-flash script: ~350 bytes inline, runs synchronously in `<head>`; negligible blocking.
- Print page: server-rendered HTML string; no client JS cost beyond Next's boilerplate; `@media print` is parsed but inert until print dialog.
- PWA SW: precache of ~50KB (2 icons + manifest + offline page + `/`). First install adds ~100ms; subsequent navigations are untouched (we bypass the worker for `/api/*`).
- CI: `.next/cache` restore typically cuts Next build from ~40s to ~15s on unchanged src. `npm audit` non-blocking → doesn't gate merges.

---

## 12. Self-Review Findings

### What I checked

- **All 5 amendments delivered verbatim**: `@custom-variant` in globals.css; `/offline` route; `.nvmrc` consistency script + CI wiring; no `sharp` in package.json; print tests on endpoint + render smoke not on fake page HTTP.
- **Scope respected**: no voice code; no permissions UI; no migrations; no runtime deps; no write-path changes.
- **Class-based dark variant actually works**: grep-verified `dark:` utilities across the codebase fire only when `<html class="dark">` is present, confirmed via `@custom-variant dark (&:where(.dark, .dark *));`.
- **useSyncExternalStore over setState-in-effect**: ThemeProvider's system-preference subscription uses the React-native primitive; lazy state init for localStorage; lint's `react-hooks/set-state-in-effect` passes clean on all new code.
- **SW threat model**: fetch handler's `isApiOrAuth` bypass is explicit and tested by inspection. Cache is versioned (`vitesse-v1`) so future bumps invalidate cleanly.
- **Frozen data in print**: `T-POLISH-PRINT-FROZEN-DATA` mutates `shop_name` post-issue and asserts the print's `vendorSnapshot.shopName` is still the frozen value.

### Invariants — proof mapping

| Invariant | Proof |
|-----------|-------|
| I-5.5-no-migrations | `git diff base -- src/db/migrations/` empty |
| I-5.5-no-api-changes | `git diff base -- src/app/api/` empty |
| I-5.5-no-new-deps | `git diff base -- package.json` shows zero dep changes (only may-or-may-not show if I touch scripts in the same file) |
| I-5.5-dark-class-based | `src/app/globals.css` contains `@custom-variant dark (&:where(.dark, .dark *))` |
| I-5.5-sw-excludes-auth | `public/sw.js::isApiOrAuth` + fetch-handler early return |
| I-5.5-print-uses-canonical-fetch | `page.tsx` grep: no `withRead`/`withTxInRoute`/service imports, only `fetch(host + /api/v1/invoices/:id)` |
| I-5.5-frozen-data-preserved | `T-POLISH-PRINT-FROZEN-DATA` |
| I-5.5-chain-unaffected | `T-POLISH-CHAIN-INTACT-AFTER-READS` |
| I-5.5-nvmrc-consistency | `scripts/verify-nvmrc.mjs` + CI Gate 0 |

### Known limitations (non-blocking, documented)

1. **No JSDOM for component tests**: `<PrintableInvoice>` is tested via `renderToStaticMarkup` (server-side render) + string-assert on output. Works well for this server component; client components still lack a JSDOM/Playwright harness (Phase 5 intentionally did not add that).
2. **PWA icons are PNGs-only**: no SVG app-icon variant for platforms that prefer it (iOS splash, adaptive icons). Adding these is a separate tranche when user demand materializes.
3. **Print CSS is minimal**: A4 + hide chrome + LTR on `.print-invoice`. Fancy elements (watermark, page numbers) omitted — PDF route already covers those use cases.
4. **Empty-state audit was surgical**: only 4 report tables that previously rendered empty `<tbody>` got empty-row handling. Full-page empty states already used `<EmptyState>` where they existed.
5. **Manual UI verification still honest-deferred**: no browser automation in the session.

---

## 13. Decision

**Status**: ✅ **ready for 5.5 review** — all 6 real gates green (372/372 integration), 5 reviewer amendments honored, scope strictly respected, zero backend / dependency / write-path changes.

### Conditions

- Local commit only. No push.
- Phase 5.5 closes on your acceptance → Phase 5 fully shipped.
- With 5.5 accepted, **Phase 5 is complete** (5.1a + 5.1b + 5.2 + 5.3 + 5.4 deferred + 5.5) and the MVP-v1 launch pack is ready.
- Phase 6 (Permissions UI, Distributions) does NOT start until you explicitly open it.
- Voice (D-83) stays deferred; re-activation requires the three conditions in D-83.
