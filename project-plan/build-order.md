# MVP Execution & Build Order

> Part of the [Budget App Plan](README.md). Codifies the **5-Phase MVP Implementation Sequence** (PWA) plus **Phase 6 (Native Shell Packaging & Store Submission)** from an empty codebase to shipped web and mobile releases, guaranteeing all **5 core engineering pillars** from the very first code commit:
> 1. **Security** (strict CSP `connect-src 'none'` + Trusted Types `require-trusted-types-for 'script'`, `<meta name="referrer" content="no-referrer">`, frame-buster guard, DOM XSS ban, base-path origin-isolated DB/cache naming, prototype-pollution-safe 10 MB backup validation, atomic IndexedDB restore, SHA-pinned CI actions / Dependabot / CodeQL / lockfile hygiene & WebView hardening)
> 2. **App Store & Play Store "Data Not Collected" Privacy** (100% on-device storage, zero network egress, iOS `ITSAppUsesNonExemptEncryption=false` + Xcode Privacy Report-derived `PrivacyInfo.xcprivacy`, Android `allowBackup="false"` + `dataExtractionRules` + `AD_ID` hygiene, Store Submission Checklist, E2E zero-egress network gate)
> 3. **Build & Testing Best Practices** (strict TypeScript compiler baseline, `.nvmrc` + `pnpm-workspace.yaml`, `>= 95%` `src/core/` coverage via `@vitest/coverage-v8`, `fake-indexeddb` integration rollback tests, 3-viewport Chromium + WebKit Playwright E2E + `@axe-core/playwright` WCAG 2.2 AA scans, post-build artifact gates, race-free mode-(a) `gh-pages` branch PR previews, Dependabot)
> 4. **Modern Zero-Prod-Dep Tech Stack** (root web `dependencies: {}` + isolated `native/` workspace & `PlatformServices` runtime seam, Web-platform `IndexedDB` / `Intl` / `crypto.randomUUID` / CSS logical units / `<dialog>` / `BroadcastChannel`, custom Vite SW plugin with no Workbox, short-month `Date.UTC` clamping + `12:00:00Z` due instant, honest storage durability via first-action `persist()`, `persisted()` status + backup nag, and OQ-4 durable native store gate)
> 5. **Post-MVP Extensibility** (`DB_VERSION = 1` schema migration switch, secondary IndexedDB indexes with no boolean index, `BudgetBackup` `schemaVersion: 1`, passphrase-encrypted backup envelope (`PBKDF2` + `AES-256-GCM`), reserved `deletedAt?`/`deviceId?` tombstones for E2EE sync, first-class CSV/OFX/QFX file import (`importBatchId`), and non-breaking seams for category envelopes, multi-period analytics, flexible cadences, split transactions, multi-account transfers, and opt-in bank sync that explicitly re-opens Pillar 2)

---

## Overview of the 6-Phase Sequence (Phases 1–5 MVP PWA + Phase 6 Native & Store Release)

```
Phase 1: Toolchain, Security/CSP Baseline & CI Gate Bootstrap
   │     (package.json ["dependencies": {}, engines, packageManager], .nvmrc, .npmrc [save-exact=true],
   │      pnpm-workspace.yaml [onlyBuiltDependencies, minimumReleaseAge], pnpm-lock.yaml,
   │      strict tsconfig.json, biome.json, vite.config.ts [VITE_BASE_PATH], vitest.config.ts [@vitest/coverage-v8],
   │      playwright.config.ts [@axe-core/playwright], index.html [CSP connect-src 'none' + Trusted Types + no-referrer + frame-buster],
   │      src/main.ts + src/main.test.ts, .github/workflows/ci.yml [SHA-pinned actions, CodeQL, dependency-review],
   │      .github/dependabot.yml + main branch protection & require-SHA-pin setting)
   ▼
Phase 2: Pure Core Domain, Validation, Recurring Engine & Insights (src/core/)
   │     (types.ts [incl. reserved importBatchId, deletedAt?, deviceId?], validate.ts [integer cents +
   │      prototype-pollution-safe 10 MB backup validator], engine.ts [short-month daysInMonth clamping +
   │      12:00:00Z due instant (OQ-2) + idempotency], funds.ts, insights.ts [period rollups via Activity.period],
   │      >= 95% line/branch unit test suite)
   ▼
Phase 3: IndexedDB Storage Layer (DB_VERSION = 1 + Indexes + Atomic Restore) & Public BudgetApi
   │     (src/storage/adapter.ts [replaceAll], memory.ts, indexeddb.ts [base-path DB_NAME (OQ-1), DB_VERSION = 1,
   │      "meta"/"rules"/"activities" stores, secondary indexes (no boolean index), atomic replaceAll,
   │      first-action navigator.storage?.persist?.() + persisted() status], src/budgetApi.ts [exportBackup/importBackup],
   │      src/index.ts + fake-indexeddb integration & rollback tests)
   ▼
Phase 4: Zero-Prod-Dep Frontend UI, iPhone-Duo Dual-State Layout & Vite-Generated PWA Service Worker
   │     (src/ui/ safe DOM helpers [zero innerHTML], Budget/Insights/Settings tabs [persisted() status + backup nag,
   │      pre-import File.size check + confirm + snapshot], native <dialog> + WCAG 2.2 AA semantics,
   │      Intl UTC-to-local TZ & integer-cent formatting, BroadcastChannel sync, 375x667 folded + 829x1194 unfolded CSS,
   │      base-path-aware public/manifest.webmanifest + custom Vite plugin emitting sw.js [same-origin guard, pr-* bypass,
   │      versioned cache, user-accepted update banner, skipped in Capacitor])
   ▼
Phase 5: Comprehensive Playwright E2E Suite, Zero-Egress/Security Audit Gates & Mode-(a) gh-pages Deploy
   │     (e2e/*.spec.ts across Chromium + WebKit & 375x667 / 829x1194 / 390x844 viewports,
   │      context.on("request") zero-external-egress gate, @axe-core/playwright WCAG 2.2 AA scans,
   │      DOM XSS immunity, preview DB-name isolation & SW update/offline E2E tests,
   │      .github/workflows/deploy-pages.yml [gh-pages branch PR preview (OQ-5) + concurrency + vars.NATIVE_BUILDS_ENABLED])
   ▼
Phase 6: Native Shell Packaging (native/ Workspace) & App Store / Play Store Submission (Post-MVP)
         (native/ workspace package [native/package.json, native/capacitor.config.ts webDir "../dist"],
          src/platform/services.ts [PlatformServices via window.Capacitor], OQ-4 durable native store
          behind StorageAdapter, passphrase-encrypted backup envelope [PBKDF2 + AES-256-GCM] + biometric app lock,
          Android allowBackup="false" + dataExtractionRules [OQ-3], iOS Info.plist
          [ITSAppUsesNonExemptEncryption=false, WKAppBoundDomains] + Xcode-derived PrivacyInfo.xcprivacy,
          Store Submission Checklist [privacy policy URL, Guideline 4.2, Financial features, Data safety])
```

---

## Why This Sequence Is Optimal

1. **Security & CI gates precede all application code (Phase 1 first):** Establishing `"dependencies": {}` CI enforcement, `.npmrc` `save-exact=true`, strict TypeScript compiler flags, Biome linting, the `<meta http-equiv="Content-Security-Policy">` baseline (`connect-src 'none'`), post-build artifact scanners, and GitHub branch protection on `main` in Phase 1 guarantees that no subsequent task PR can ever merge an unsafe runtime dependency, type error, DOM XSS sink, or external network URL.
2. **Pure financial & validation logic precedes I/O and UI (Phase 2 before Phases 3–4):** Implementing `src/core/` as 100% pure, platform-agnostic TypeScript with `>= 95%` unit test coverage isolates integer-cent arithmetic (`amountCents`), recurring period idempotency, short-month `Date.UTC` clamping (`dayOfMonth` 29–31), and untrusted JSON backup validation (`validateBackupPayload`) before introducing asynchronous IndexedDB transactions or DOM event listeners.
3. **Storage & `BudgetApi` contract precede UI (Phase 3 before Phase 4):** Verifying `IndexedDbAdapter` (`DB_VERSION = 1`, secondary indexes, single-transaction atomic `replaceAll` rollback) and `createBudgetApi` (`exportBackup` / `importBackup`) against `fake-indexeddb` ensures that the Phase 4 frontend consumes a completely stable, transactionally safe persistence contract.
4. **Full E2E, zero-egress privacy proof, and Pages preview automation close the loop (Phase 4 → Phase 5):** Running Playwright E2E tests against the production `dist/` bundle (`vite preview`) across Chromium + WebKit and all three target viewports (`375×667`, `829×1194`, `390×844`) mathematically proves zero network egress (backing Apple App Store and Google Play Store "Data Not Collected" declarations), DOM XSS immunity, offline PWA capability, and responsive layout integrity before shipping.

---

## Phase-by-Phase Specification

### Phase 1 — Toolchain, Security/CSP Baseline & CI Gate Bootstrap

- **Scope & Target Files:**
  - `package.json` (`"dependencies": {}`, `"engines": { "node": "..." }`, `packageManager: "pnpm@..."` using a pnpm 10+ release that supports npm's bulk audit endpoint, exact current `devDependencies` majors decided at bootstrap including `@vitest/coverage-v8` and `@axe-core/playwright`, scripts for `build`, `test`, `test:e2e`, `lint`, `typecheck`)
  - `.nvmrc` (current Active-LTS even Node.js release verified from `nodejs.org` at bootstrap, referenced by CI via `node-version-file: '.nvmrc'`)
  - `.npmrc` (`save-exact=true`), `pnpm-workspace.yaml` (`onlyBuiltDependencies` e.g. `esbuild`, `minimumReleaseAge` cooldown), and `pnpm-lock.yaml`
  - `tsconfig.json` (with all mandatory strict flags from [dependency-strategy.md](dependency-strategy.md#strict-typescript-compiler-flags-tsconfigjson))
  - `biome.json` (lint + format rules)
  - `vite.config.ts` (`base: process.env.VITE_BASE_PATH ?? "/simple-budget-app/"`)
  - `vitest.config.ts` (enforcing `>= 95%` line & branch coverage threshold on `src/core/` via `@vitest/coverage-v8`)
  - `playwright.config.ts` (configuring `375×667` folded, `829×1194` unfolded, and `390×844` secondary slab projects across headless Chromium and WebKit against `vite preview`, with `@axe-core/playwright` available for WCAG 2.2 AA scans)
  - `index.html` (with the strict `<meta http-equiv="Content-Security-Policy">` tag including `connect-src 'none'` and `require-trusted-types-for 'script'` (Trusted Types defense-in-depth), `<meta name="referrer" content="no-referrer">`, and the 3-line `top !== self` frame-buster guard per [frontend.md](frontend.md#1-strict-content-security-policy-indexhtml))
  - Minimal `src/main.ts` bootstrap shell + initial colocated smoke unit test (`src/main.test.ts`)
  - `.github/workflows/ci.yml` (all `uses:` actions full-40-char-SHA pinned `# vX.Y.Z`, `pnpm/action-setup` without assuming `corepack`, `actions/setup-node` with `node-version-file: '.nvmrc'`, least-privilege `permissions: contents: read`, post-build CSP/XSS/zero-external-URL/zero-prod-dep gates, `pnpm audit --audit-level=high`, `actions/dependency-review-action`, and CodeQL via `github/codeql-action` per [testing.md](testing.md#the-test-pyramid-who-does-what--when))
  - `.github/dependabot.yml` (`github-actions` and `npm` ecosystems)
  - GitHub repository settings: branch protection rules on `main` and **"Require actions to be pinned to a full-length commit SHA"** enabled
- **Dependencies:** None (first code implementation phase).
- **Why This Order (Pillars 1–5 Alignment):** Locks in Pillar 1 (supply-chain hygiene, CSP `connect-src 'none'`, DOM XSS CI ban), Pillar 2 (zero external asset URLs in `dist/`), Pillar 3 (deterministic lockfile, strict TS, CI gates), and Pillar 4 (modern Vite + Vitest + Biome + Playwright toolchain) before feature code begins.
- **Enforced Security, Privacy & Test Invariants:**
  - `Object.keys(pkg.dependencies ?? {}).length === 0`
  - `dist/index.html` contains `http-equiv="Content-Security-Policy"`, `connect-src 'none'`, `require-trusted-types-for 'script'`, `trusted-types sw-register`, and `<meta name="referrer" content="no-referrer">` (and omits `frame-ancestors` in `<meta>` so browsers log zero console warnings)
  - Zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, or `eval(` in `src/`
  - Zero external `http(s)://` URLs in `dist/`
- **Executable Verification Gates:**
  - `pnpm install --frozen-lockfile`
  - `pnpm exec biome check .`
  - `pnpm exec tsc --noEmit`
  - `pnpm test` (non-interactive `vitest run`)
  - `pnpm run build`
  - Post-build CI security/artifact checks and `pnpm audit --audit-level=high`

---

### Phase 2 — Pure Core Domain, Validation, Recurring Engine & Insights (`src/core/`)

- **Scope & Target Files:**
  - `src/core/types.ts` (`RecurringRule`, `Activity`, `RulePatch`, `ActivityPatch`, `BudgetBackup`, `SearchFilter` / `ActivitySearchFilter`, `ActivityFilter`, `TagSummary`, and post-MVP reserved fields `importBatchId`, `source: "bank-sync"`, `externalTxnId`, `sourceAccountId`, plus E2EE sync tombstone slots `deletedAt?` / `deviceId?`)
  - `src/core/validate.ts` (integer-cent `amountCents` safe-integer & upper-bound `<= Number.MAX_SAFE_INTEGER` guards, ISO-8601 UTC timestamp validator, UUID/string-length/tag validators, and prototype-pollution-safe, 10 MB-bounded `validateBackupPayload(rawJson: string): BudgetBackup` per [data-model.md](data-model.md#versioned-budgetbackup-schema--hardened-import-validation))
  - `src/core/engine.ts` (`missingPeriods` and `dueDateTime` with short-month `daysInMonth` clamping, fixed `12:00:00Z` due instant (OQ-2), and idempotent `(sourceRuleId, period)` materialization per [recurring-engine.md](recurring-engine.md#the-algorithm-mvp-monthly))
  - `src/core/funds.ts` (`computeAvailableFunds` derived in integer cents per [activity-model.md](activity-model.md#available-funds--derived-from-the-activity-log))
  - `src/core/insights.ts` (`searchActivities` intersecting `since`/`until`/`tag`/`type` predicates, period rollups using `Activity.period` for `source === "recurring"`, and `summarizeByTag` rollups per [activity-model.md](activity-model.md#insights--search))
  - Unit test suite (`src/core/*.test.ts`)
- **Dependencies:** Phase 1.
- **Why This Order (Pillars 1–5 Alignment):** Enforces the strict [portability boundary](portability.md#the-boundary) (`src/core/` imports nothing from `src/storage/`, the DOM, or Node globals) and proves all financial arithmetic, date math, and untrusted backup validation in fast, deterministic unit tests.
- **Enforced Security, Privacy & Test Invariants:**
  - Integer-cent money invariant (`Number.isSafeInteger(amountCents) && amountCents > 0`, decimal input `<= Number.MAX_SAFE_INTEGER / 100`)
  - Short-month `Date.UTC` clamping (`const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate(); const effectiveDay = Math.min(rule.schedule.dayOfMonth, daysInMonth);`) preventing Feb 29–31 / Apr 31 overflow into the next month
  - `rule.lastPostPeriod` progression preventing re-posting of user-deleted recurring activities
  - `validateBackupPayload` rejecting payloads `> 10,485,760` bytes, `__proto__` / `constructor` / `prototype` keys, unsupported `schemaVersion`, duplicate IDs, and mixed currencies
- **Executable Verification Gates:**
  - `pnpm test` (`vitest run --coverage`) passing with **`>= 95%` line and branch coverage on `src/core/`**, covering all mandatory unit test scenarios in [testing.md](testing.md#2-mandatory-unit-test-scenarios-srccoretestts) (short-month clamping for `dayOfMonth = 31` in Feb/Apr, idempotency across year boundaries, integer-cent bounds, and prototype-pollution rejection).

---

### Phase 3 — IndexedDB Storage Layer (`DB_VERSION = 1` + Indexes + Atomic Restore) & Public `BudgetApi` (`src/storage/`, `src/budgetApi.ts`)

- **Scope & Target Files:**
  - `src/storage/adapter.ts` (`StorageAdapter` interface including `replaceAll(data: { rules: RecurringRule[]; activities: Activity[] }): Promise<void>` per [storage.md](storage.md#recommended-approach))
  - `src/storage/memory.ts` (`InMemoryAdapter` for fast unit/controller tests)
  - `src/storage/indexeddb.ts` (`IndexedDbAdapter` with base-path-derived `DB_NAME` (`deriveDbName(import.meta.env.BASE_URL)`), `DB_VERSION = 1`, `onupgradeneeded(event)` sequential migration switch, `"meta"` (schema + `lastBackupAt`) / `"rules"` (in-memory filtering for active vs. paused; no boolean index) / `"activities"` object stores, secondary indexes `by_dateTime`, `by_type`, `by_tags` (`multiEntry: true`), and compound `by_rule_period` (`["sourceRuleId", "period"]`), single-transaction atomic `replaceAll`, best-effort `navigator.storage?.persist?.()` triggered after the first user write/action, and `navigator.storage?.persisted?.()` status readout per [storage.md](storage.md#indexeddb-schema-versioning-indexes--migration-strategy))
  - `src/budgetApi.ts` (`createBudgetApi` implementing `BudgetApi`, including `exportBackup()` recording `lastBackupAt` in `"meta"` and `importBackup(json: string)` with pre-import confirmation + auto-snapshot contract per [storage.md](storage.md#atomic-backup-restoration-replaceall) and [portability.md](portability.md#the-public-api-what-the-front-end-calls))
  - `src/index.ts` (public library exports)
  - Integration test suite (`src/storage/*.test.ts` using `fake-indexeddb`)
- **Dependencies:** Phase 2.
- **Why This Order (Pillars 1–5 Alignment):** Combines Pillar 1 (atomic all-or-nothing backup restoration with pre-import safety), Pillar 2 (100% local IndexedDB persistence with zero cloud calls), Pillar 4 (honest browser/WebView durability via first-action `navigator.storage?.persist?.()`, `persisted()` status + N-day backup nag in Settings, and the OQ-4 durable native store release gate for store builds), and Pillar 5 (`DB_VERSION = 1` migration switch, secondary indexes, and reserved `deletedAt?`/`deviceId?` slots for post-MVP scale) into the single `BudgetApi` façade before UI work begins.
- **Enforced Security, Privacy & Test Invariants:**
  - `importBackup(json)` validates the entire payload in memory via `validateBackupPayload(json)` (with UI `File.size <= 10 MB` pre-read check, confirmation dialog, and pre-import safety snapshot) **before** calling `storage.replaceAll(...)`
  - `replaceAll` executes inside a single IndexedDB `readwrite` transaction spanning `["rules", "activities"]`; any error aborts the transaction and leaves prior stored data completely intact
  - `init()` runs `runRecurringEngine` idempotently without calling `persist()` prematurely; `navigator.storage?.persist?.()` is invoked best-effort after the first user write/action (never throwing if unsupported), and `navigator.storage?.persisted?.()` + `lastBackupAt` are exposed for Settings
  - **Store-release durability gate (OQ-4):** IndexedDB is the MVP PWA store; before the first App Store / Play Store submission, a durable native store (SQLite `StorageAdapter` or mirrored auto-snapshot to native app Documents) is required behind `StorageAdapter`
- **Executable Verification Gates:**
  - `pnpm test` passing all `fake-indexeddb` integration tests in [testing.md](testing.md#3-mandatory-storage--api-integration-scenarios-fake-indexeddb) (cold/warm start, `DB_VERSION = 1` store & index creation with no boolean index, listing active vs. paused recurring rules via in-memory filtering, atomic `replaceAll` rollback leaving prior data intact on simulated write failure, first-action `persist()` + `persisted()` + `lastBackupAt` tracking, index lookups, and built-bundle `dist/` smoke import).

---

### Phase 4 — Zero-Prod-Dep Frontend UI, iPhone-Duo Dual-State Layout & Vite-Generated PWA Service Worker (`src/ui/`, `src/styles/`, `public/`, Vite SW plugin)

- **Scope & Target Files:**
  - Safe DOM construction helper layer in `src/ui/` (strictly `document.createElement`, `node.textContent`, `element.setAttribute`, `element.replaceChildren` — zero `innerHTML` / `outerHTML` / `insertAdjacentHTML` per [frontend.md](frontend.md#2-dom-xss-ban-safe-dom-apis-only))
  - `src/ui/` view controllers for **Budget** (Available Funds header, quick-add manual expense/deposit/income, recent activity feed, recurring rules drawer/sheet), **Insights** (period + tag + type search filter + `summarizeByTag` rollups), and **Settings** (recurring rule management, `navigator.storage.persisted()` status + N-day backup-age nag from `lastBackupAt`, and JSON backup export/import via `budget.exportBackup()` / `budget.importBackup(json)` with pre-read `File.size <= 10 MB` check, confirmation dialog, and automatic pre-import safety snapshot)
  - Native `<dialog>` modals and WCAG 2.2 AA accessibility semantics (`<nav role="tablist">`, `<button role="tab" aria-selected>`, `aria-live="polite"` on Available Funds, `>= 44×44 CSS px` touch targets per [frontend.md](frontend.md#1-semantic-html--wcag-22-aa-accessibility))
  - `Intl.DateTimeFormat` UTC-to-local timezone rendering and `Intl.NumberFormat` integer-cent formatting
  - `BroadcastChannel("simple-budget-sync")` cross-tab state refresh listener/emitter per [frontend.md](frontend.md#2-multi-tab-state-synchronization-broadcastchannel)
  - `src/styles/` iPhone-Duo dual-state responsive CSS (`375×667` folded 1-page baseline + `829×1194` unfolded split-pane enhanced view + `390×844` slab phone target, logical viewport units `svh`/`dvh`, `env(safe-area-inset-*)`, zero vertical/horizontal page scroll per [frontend.md](frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2))
  - Base-path-aware `public/manifest.webmanifest` and a custom in-repo Vite plugin emitting `dist/sw.js` at build time (NOT a static `public/sw.js` and NOT `vite-plugin-pwa`/Workbox, keeping `dependencies: {}`) with the build hash + precache manifest, base-path-derived versioned cache name (`sbapp-<scope>-<buildhash>`), strict same-origin guard (`new URL(event.request.url).origin === self.location.origin`), `pr-*` sub-path bypass on the production SW, old-cache cleanup on `activate`, `skipWaiting` invoked **only** after the user accepts an "Update available" banner, network-first navigations with cache fallback, and SW registration skipped inside Capacitor native shells per [frontend.md](frontend.md#service-worker-design-pwa-offline-scoping--update-lifecycle)
- **Dependencies:** Phase 3.
- **Why This Order (Pillars 1–5 Alignment):** Builds the complete user experience on top of the verified `BudgetApi` without adding a single runtime dependency (`dependencies: {}`), guaranteeing that the identical `dist/` static bundle runs in the PWA (GitHub Pages) and future iOS/Android Capacitor shells.
- **Enforced Security, Privacy & Test Invariants:**
  - Zero `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / `eval` across `src/`
  - Zero remote fonts, CDNs, or icon requests (system font stack and local bundled SVG/CSS assets only)
  - Zero page-level vertical or horizontal overflow (`scrollHeight <= clientHeight` and `scrollWidth <= clientWidth`) across folded and unfolded states
- **Executable Verification Gates:**
  - `pnpm run build` producing the single cross-platform static bundle in `dist/`
  - Post-build CI checks passing (zero `innerHTML` in `src/`, CSP `<meta>` present in `dist/index.html`, zero external `http(s)://` URLs in `dist/`, `dependencies: {}`)
  - Unit/integration UI controller tests passing via `pnpm test`

---

### Phase 5 — Comprehensive Playwright E2E Suite, Zero-Egress/Security Audit Gates & Mode-(a) GitHub Pages Deploy Pipeline (`e2e/`, `.github/workflows/deploy-pages.yml`)

- **Scope & Target Files:**
  - `e2e/*.spec.ts` running against `vite preview` of the built `dist/` bundle across **Chromium** and **WebKit** and all 3 mandatory viewports (`375×667` folded, `829×1194` unfolded, `390×844` secondary slab) per [testing.md](testing.md#4-mandatory-playwright-e2e-security-privacy--viewport-scenarios-e2espects):
    - Global `context.on("request")` zero-external-egress assertion (failing immediately if any request leaves the local preview origin)
    - Zero `page.on("pageerror")` and zero `page.on("console")` error/warning gate
    - Full user journeys: cold-start initialization, recurring rule creation & idempotent auto-posting across reloads, manual expense/deposit/income creation, activity editing/backdating/tagging, `searchActivities` & `summarizeByTag` Insights filtering, and JSON backup export → corrupt import rejection (existing data preserved) → valid restore
    - DOM XSS payload immunity tests (`<img src=x onerror=window.__xss=1>`, `<script>window.__xss=1</script>` rendered as inert literal text via `textContent`)
    - Automated `@axe-core/playwright` WCAG 2.2 AA accessibility scans (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) per tab and with `<dialog>` open
    - Preview origin-isolation E2E test asserting a `pr-<N>/` build opens a differently-named IndexedDB (`simple-budget-app-pr-<N>` vs. `simple-budget-app`)
    - Offline Service Worker reload, cache-version cleanup, and update-banner E2E test (`context.setOffline(true)` after initial load in Chromium)
    - Layout & touch-target geometry assertions (`scrollHeight <= clientHeight`, `scrollWidth <= clientWidth`, primary controls `>= 44×44 CSS px`)
  - `.github/workflows/deploy-pages.yml` implementing mode-(a) same-site sub-path PR previews via plain `git` publishing to the `gh-pages` branch using `GITHUB_TOKEN` (OQ-5 — **flagged to the user for confirmation**; Pages source = "Deploy from a branch" → `gh-pages`; PR triggers restricted to PRs targeting `main`; preview job writes only `pr-<PR#>/`; close job runs `git rm -rf pr-<PR#>/`; `main` push writes root files excluding `pr-*/`; `contents: write` on the publish job only; `concurrency: { group: "pages-deploy", cancel-in-progress: false }`; no third-party Pages action), plus skip-not-fail credential-gated Android/iOS native build jobs per [testing.md](testing.md#ci-deploy--preview-github-pages)
- **Dependencies:** Phase 4.
- **Why This Order (Pillars 1–5 Alignment):** Closes the verification loop with end-to-end browser proof on both target rendering engines (Chromium for Android/desktop, WebKit for iOS/iPhone-Duo) and automates isolated PR previews without ever risking the production deployment.
- **Enforced Security, Privacy & Test Invariants:**
  - Mathematical E2E proof of zero external network requests (`new URL(req.url()).origin === previewOrigin`), directly substantiating Apple App Store Connect "Data Not Collected" and Google Play Console "No data shared / No data collected" declarations
  - Serialized `gh-pages` branch publishing (`cancel-in-progress: false`) with least-privilege `contents: write` scoped strictly to the publish job, preventing concurrent PR preview race conditions
  - Native mobile jobs gated at job level by `if: ${{ vars.NATIVE_BUILDS_ENABLED == 'true' }}` (no `secrets` or `env` in job-level `if:`; signing secrets mapped to step `env:` inside the job — skip-not-fail when disabled, build-only when enabled, matching [testing.md](testing.md#android--ios-test-build-pipeline-credential-skip-build-only) identically)
- **Executable Verification Gates:**
  - `pnpm exec playwright test` passing 100% of E2E specs on Chromium + WebKit across all 3 viewports (`375×667`, `829×1194`, `390×844`) with zero console errors/warnings, zero page errors, and zero external network requests (using headless CLI execution with no hanging server processes per [testing.md](testing.md#headless--cli-execution-rule-no-hanging-dev-servers)).

---

### Phase 6 — Native Shell Packaging (`native/` Workspace) & App Store / Play Store Submission (Post-MVP Store Release)

- **Scope & Target Files:**
  - `native/package.json` and `native/capacitor.config.ts` (`webDir: "../dist"`, `server.allowNavigation: []`, `android.allowMixedContent: false`, `android.webContentsDebuggingEnabled: false`, and `ios.limitsNavigationsToAppBoundDomains: true` paired with `WKAppBoundDomains` in `Info.plist`, or flag omitted cleanly per [portability.md](portability.md#4-capacitor-webview-runtime-hardening-nativecapacitorconfigts)) — isolated workspace package so the root web bundle package keeps `"dependencies": {}` and never imports `@capacitor/*`
  - `src/platform/services.ts` (tiny `PlatformServices` runtime seam — `saveBackup`, `shareBackup`, `isNative` — resolved via `window.Capacitor` feature detection so `dist/` stays identical across PWA, iOS, and Android per [portability.md](portability.md#package-boundary--platformservices-seam))
  - Durable native store adapter wired behind `StorageAdapter` (OQ-4 release gate: SQLite `StorageAdapter` or mirrored auto-snapshot to native app Documents per [storage.md](storage.md#why-a-storage-adapter))
  - Passphrase-encrypted backup export (WebCrypto `AES-256-GCM` + `PBKDF2-HMAC-SHA256 >= 600_000` iterations, versioned `{ schemaVersion, enc: { alg, kdf, iter, salt, iv }, ciphertext }` envelope per [data-model.md](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)) and optional native biometric app lock (also mitigating Apple Guideline 4.2)
  - `native/android/app/src/main/AndroidManifest.xml` (`android:allowBackup="false"`, `android:fullBackupContent="false"`, `android:dataExtractionRules="@xml/data_extraction_rules"`, `AD_ID` omitted/removed) and `native/android/app/src/main/res/xml/data_extraction_rules.xml` excluding `cloud-backup` and `device-transfer` (OQ-3)
  - `native/ios/App/App/Info.plist` (`ITSAppUsesNonExemptEncryption = false`, matching `WKAppBoundDomains` if enabled) and `native/ios/App/App/PrivacyInfo.xcprivacy` derived from Xcode's **"Generate Privacy Report"** on the release archive
  - Store submission artifacts per [portability.md → Store Submission Checklist](portability.md#store-submission-checklist-phase-6): public privacy policy URL, Apple App Store Review Notes (Guideline 4.2 mitigation), Google Play Financial features declaration, Data safety form (including backup posture), and Google Play 12-tester / 14-day closed test (verify current policy at submission)
- **Dependencies:** Phase 5.
- **Why This Order (Pillars 1–5 Alignment):** Keeps the MVP PWA (Phases 1–5) zero-prod-dep and fast to ship while ensuring store-distributed mobile builds meet every security, durability (OQ-4), backup-isolation (OQ-3), privacy-manifest, and store-review requirement before first submission.
- **Enforced Security, Privacy & Test Invariants:**
  - Root `package.json` `dependencies` remains `{}` and `src/` has zero `@capacitor/*` imports; `dist/` is identical across PWA, iOS, and Android
  - `native/package.json` dependencies are exact-pinned (`save-exact=true`) and pass `pnpm audit --audit-level=high`
  - Android disables Auto Backup (`allowBackup="false"` + `dataExtractionRules` excluding `cloud-backup` and `device-transfer`); iOS documents accepted encrypted iCloud/iTunes device backup and sets `ITSAppUsesNonExemptEncryption = false`
  - `PrivacyInfo.xcprivacy` matches Xcode's generated Privacy Report for Capacitor core + all installed native plugins
  - Durable native store (OQ-4) verified so WebView eviction cannot lose user financial records
- **Executable Verification Gates:**
  - Root web package CI gates still pass (`dependencies: {}`, zero `@capacitor/*` in `src/`, `pnpm audit --audit-level=high` across the full workspace including `native/`)
  - Credential-gated native CI builds (`vars.NATIVE_BUILDS_ENABLED == 'true'`) compile signed/unsigned Android & iOS artifacts cleanly
  - Release `.xcarchive` passes Xcode **"Generate Privacy Report"** audit with zero undeclared Required-Reason APIs
  - On-device smoke test of `PlatformServices` (`saveBackup`/`shareBackup`), durable native store persistence across cold restarts, and every item in [portability.md → Store Submission Checklist](portability.md#store-submission-checklist-phase-6) checked off.

---

## 5-Pillar Cross-Reference Matrix

| Core Engineering Pillar | Key Guarantees & Technical Guardrails | Plan Specification Links | Enforced in Build Phase(s) |
| ----------------------- | ------------------------------------- | ------------------------ | -------------------------- |
| **1. Security (Utmost Importance)** | • Strict W3C CSP3 `<meta http-equiv="Content-Security-Policy">` (`connect-src 'none'`, `default-src 'self'`, Trusted Types `require-trusted-types-for 'script'`, no `frame-ancestors` warning), `<meta name="referrer" content="no-referrer">`, 3-line `top !== self` frame-buster, and Vite-generated `sw.js` same-origin + `pr-*` bypass guard<br>• Base-path origin-isolated IndexedDB & CacheStorage naming (`simple-budget-app` vs. `simple-budget-app-pr-<N>`, OQ-1)<br>• Strict ban on `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval` across `src/`<br>• 10 MB-bounded, prototype-pollution-safe (`__proto__`, `constructor`, `prototype` rejected) `validateBackupPayload` + pre-import snapshot/confirm + Phase 6 encrypted backup envelope (`PBKDF2` + `AES-256-GCM`) & biometric app lock<br>• Single-transaction atomic IndexedDB `replaceAll` rollback on import failure<br>• Root web `dependencies: {}`, `.npmrc` `save-exact=true`, `pnpm-workspace.yaml` (`onlyBuiltDependencies`, `minimumReleaseAge`), `pnpm audit --audit-level=high`, full-40-char SHA-pinned CI actions, Dependabot, CodeQL, `dependency-review`, `native/capacitor.config.ts` `allowNavigation: []` + `WKAppBoundDomains` | • [frontend.md → Security & Privacy Guardrails](frontend.md#security--privacy-guardrails)<br>• [frontend.md → Shared-Origin Isolation](frontend.md#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default)<br>• [data-model.md → Versioned `BudgetBackup` Schema & Hardened Import Validation](data-model.md#versioned-budgetbackup-schema--hardened-import-validation)<br>• [data-model.md → Post-MVP Encrypted Backup Envelope](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)<br>• [storage.md → Atomic Backup Restoration (`replaceAll`)](storage.md#atomic-backup-restoration-replaceall)<br>• [storage.md → Security properties](storage.md#security-properties)<br>• [dependency-strategy.md → Guardrails](dependency-strategy.md#guardrails-enforce-in-ci--review)<br>• [portability.md → Capacitor WebView Runtime Hardening](portability.md#4-capacitor-webview-runtime-hardening-nativecapacitorconfigts) | **Phase 1** (CSP, Trusted Types, SHA pins, Dependabot, CodeQL, lockfile)<br>**Phase 2** (`validateBackupPayload`)<br>**Phase 3** (base-path `DB_NAME`, atomic `replaceAll`)<br>**Phase 4** (safe DOM APIs, Vite-generated `sw.js` guard)<br>**Phase 5** (DOM XSS, preview DB isolation & SW E2E gates)<br>**Phase 6** (`native/` WebView, encrypted backup & biometric lock) |
| **2. App Store & Play Store "Data Not Collected" Privacy** | • Legitimate Apple App Store Connect **"Data Not Collected"** & Google Play Console **"No data shared / No data collected"** declarations<br>• 100% on-device storage, zero analytics/telemetry/crash SDKs, zero remote fonts/CDNs/icons; CSV/OFX/QFX file import preserves the label while bank-sync aggregators explicitly re-open Pillar 2<br>• iOS `Info.plist` (`ITSAppUsesNonExemptEncryption=false`) + `PrivacyInfo.xcprivacy` derived from Xcode Privacy Report (preventing `ITMS-91053`)<br>• Android `allowBackup="false"` + `dataExtractionRules` excluding `cloud-backup` & `device-transfer` (OQ-3), `AD_ID` stripped<br>• Store Submission Checklist (privacy policy URL, Guideline 4.2, Financial features, Data safety) & Playwright `context.on("request")` zero-egress gate | • [portability.md → App Store & Play Store Privacy Compliance ("Data Not Collected")](portability.md#app-store--play-store-privacy-compliance-data-not-collected)<br>• [portability.md → iOS `PrivacyInfo.xcprivacy`](portability.md#2-ios-required-reason-api-privacy-manifest-nativeiosappappprivacyinfoxcprivacy)<br>• [portability.md → Google Play Console Data Safety](portability.md#3-google-play-console--data-safety-backup-exclusion--manifest-hygiene)<br>• [portability.md → Store Submission Checklist](portability.md#store-submission-checklist-phase-6)<br>• [data-model.md → Privacy-Label Impact and Sync Tradeoffs](data-model.md#privacy-label-impact-and-sync-tradeoffs)<br>• [frontend.md → Zero Remote Fonts, CDNs, or Icon Requests](frontend.md#3-zero-remote-fonts-cdns-or-icon-requests)<br>• [testing.md → Mandatory Playwright E2E Security, Privacy & Viewport Scenarios](testing.md#4-mandatory-playwright-e2e-security-privacy--viewport-scenarios-e2espects) | **Phase 1** (`connect-src 'none'`, zero external URLs in `dist/`)<br>**Phase 4** (self-hosted assets only)<br>**Phase 5** (Playwright `context.on("request")` zero-egress E2E proof)<br>**Phase 6** (backup flags, Privacy Report, store checklist) |
| **3. Build & Testing Best Practices** | • Strict `tsconfig.json` compiler flags (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, etc.), `.nvmrc` + `node-version-file`, exact versions decided at bootstrap, `.github/dependabot.yml`, and full-SHA-pinned CI actions<br>• `>= 95%` line & branch coverage gate on `src/core/` via `@vitest/coverage-v8` (colocated `src/**/*.test.ts`)<br>• `fake-indexeddb` integration & atomic rollback test suite (incl. in-memory active/paused rule filtering)<br>• Playwright E2E across Chromium + WebKit & 3 viewports (`375×667`, `829×1194`, `390×844`) against `vite preview` + `@axe-core/playwright` WCAG 2.2 AA scans<br>• Mode-(a) sub-path PR preview (`/simple-budget-app/pr-<PR#>/`) via `gh-pages` branch publishing (OQ-5) with `concurrency: { group: "pages-deploy", cancel-in-progress: false }` and `vars.NATIVE_BUILDS_ENABLED == 'true'` native gating | • [dependency-strategy.md → Strict TypeScript Compiler Flags](dependency-strategy.md#strict-typescript-compiler-flags-tsconfigjson)<br>• [dependency-strategy.md → CI actions (the allowed set)](dependency-strategy.md#ci-actions-the-allowed-set)<br>• [testing.md → The Test Pyramid](testing.md#the-test-pyramid-who-does-what--when)<br>• [testing.md → Coverage Threshold & Mandatory Security / Edge-Case Test Matrix](testing.md#coverage-threshold--mandatory-security--edge-case-test-matrix)<br>• [testing.md → CI workflow mechanics (`gh-pages`)](testing.md#ci-workflow-mechanics-gh-pages-branch-publishing--prune-on-merge--production-unchanged)<br>• [testing.md → GitHub Pages Mode-(a) Concurrency & Site-Tree Preservation](testing.md#github-pages-mode-a-concurrency--site-tree-preservation-githubworkflowsdeploy-pagesyml)<br>• [testing.md → Headless / CLI Execution Rule](testing.md#headless--cli-execution-rule-no-hanging-dev-servers) | **Phase 1** (CI bootstrap, `.nvmrc`, Dependabot, SHA pins, strict TS, Vitest/Playwright config)<br>**Phase 2** (`>= 95%` core unit coverage)<br>**Phase 3** (`fake-indexeddb` integration tests)<br>**Phase 5** (Playwright E2E, axe a11y + `deploy-pages.yml`)<br>**Phase 6** (native CI & device verification) |
| **4. Modern Zero-Prod-Dep Tech Stack** | • Single cross-platform static bundle (`vite build` → `dist/`) with root `dependencies: {}` & zero `@capacitor/*` in `src/`; `native/` workspace package + `PlatformServices` runtime seam; custom in-repo Vite SW plugin (no Workbox)<br>• Integer-cent money (`amountCents`) + `Intl.NumberFormat` / `Intl.DateTimeFormat`<br>• Short-month `Date.UTC` clamping (`daysInMonth`, fixed `12:00:00Z` due instant, OQ-2) + `rule.lastPostPeriod` deletion tombstone alignment<br>• Honest storage durability (first-action `persist()`, `persisted()` status & N-day backup nag in Settings + OQ-4 durable native store release gate)<br>• WCAG 2.2 AA accessibility (`<dialog>`, `role="tablist"`, `aria-live="polite"`, `44×44 CSS px` targets) + `BroadcastChannel` multi-tab sync | • [dependency-strategy.md → Zero production dependencies](dependency-strategy.md#zero-production-dependencies)<br>• [portability.md → Package boundary & `PlatformServices` seam](portability.md#package-boundary--platformservices-seam)<br>• [frontend.md → Service Worker Design](frontend.md#service-worker-design-pwa-offline-scoping--update-lifecycle)<br>• [recurring-engine.md → Short-Month `Date.UTC` Clamping](recurring-engine.md#short-month-dateutc-clamping)<br>• [activity-model.md → Editing any activity](activity-model.md#editing-any-activity)<br>• [storage.md → Storage Durability & WebKit Eviction Mitigation](storage.md#storage-durability--webkit-eviction-mitigation)<br>• [frontend.md → Accessibility (WCAG 2.2 AA) & Multi-Tab State Synchronization](frontend.md#accessibility-wcag-22-aa--multi-tab-state-synchronization) | **Phase 1** (Vite/TS/Biome stack)<br>**Phase 2** (short-month clamping, `12:00:00Z` due instant, integer cents)<br>**Phase 3** (first-action `persist()`, `persisted()` + `lastBackupAt`)<br>**Phase 4** (WCAG 2.2 AA, `BroadcastChannel`, custom Vite SW plugin, iPhone-Duo CSS)<br>**Phase 6** (`native/` workspace, `PlatformServices`, durable native store) |
| **5. Post-MVP Extensibility** | • IndexedDB `DB_VERSION = 1` sequential `onupgradeneeded` migration switch + `"meta"` store<br>• Secondary indexes (`by_dateTime`, `by_type`, `by_tags` multiEntry, compound `by_rule_period`; no boolean index) + reserved `deletedAt?`/`deviceId?` tombstones for future E2EE sync<br>• Passphrase-encrypted backup envelope (`PBKDF2-HMAC-SHA256 >= 600k` + `AES-256-GCM`) & biometric app lock (Phase 6 store gate)<br>• Non-breaking extension seams for: (1) Category Budgets/Envelopes (`BudgetTarget`), (2) Multi-Period Trends (`summarizeByPeriod`), (3) Flexible Cadences (`weekly`/`bi-weekly`/`yearly`), (4) Split Transactions (`splits`), (5) Multi-Account & Transfers (`Account` + `transferPeerId`), (6) First-class CSV/OFX/QFX file import (`importBatchId`, `externalTxnId`), opt-in SimpleFIN Bridge, and bank-sync aggregators (separate project re-opening Pillar 2), (7) Multi-Currency, (8) E2EE Multi-Device Sync | • [storage.md → IndexedDB Schema Versioning, Indexes & Migration Strategy](storage.md#indexeddb-schema-versioning-indexes--migration-strategy)<br>• [data-model.md → Post-MVP Encrypted Backup Envelope](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)<br>• [data-model.md → Post-MVP Extensibility & Growth Seams](data-model.md#post-mvp-extensibility--growth-seams)<br>• [data-model.md → Privacy-Label Impact and Sync Tradeoffs](data-model.md#privacy-label-impact-and-sync-tradeoffs)<br>• [activity-model.md → Post-MVP Analytics & Category Target Composition](activity-model.md#3-post-mvp-analytics--category-target-composition)<br>• [portability.md → The public API](portability.md#the-public-api-what-the-front-end-calls) | **Phase 2** (extensible `types.ts` + `BudgetBackup` `schemaVersion: 1`)<br>**Phase 3** (`DB_VERSION = 1` migration switch + secondary indexes)<br>**Phase 6** (encrypted backup envelope & biometric app lock) |

---

## Adopted Review Defaults (Story #164 — OQ-1..OQ-5)

The independent third-model review (Story #164 / Spike #165) resolved five open design questions with explicit defaults so implementation is never blocked:

| ID | Question | Adopted Default | Status / Notes |
| -- | -------- | --------------- | -------------- |
| **OQ-1** | Origin isolation on GitHub Pages (`tandyn.github.io`) | Derive IndexedDB (`DB_NAME`) and CacheStorage names from `import.meta.env.BASE_URL` (`simple-budget-app` vs. `simple-budget-app-pr-<N>`) and document the shared-origin residual risk. A custom domain for the production PWA is optional (recommended for full origin isolation). | Adopted by default ([frontend.md](frontend.md#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default)) |
| **OQ-2** | Recurring due instant vs. timezone drift | Fixed `12:00:00Z` due instant (correct local calendar day for UTC−12..UTC+11) with period rollups using `Activity.period` for `source === "recurring"` and documented UTC+12..+14 residual (instead of passing an IANA zone into the engine). | Adopted by default ([recurring-engine.md](recurring-engine.md#short-month-dateutc-clamping)) |
| **OQ-3** | Android Auto Backup posture | Exclude all (`android:allowBackup="false"`, `android:fullBackupContent="false"`, `dataExtractionRules` excluding `cloud-backup` and `device-transfer`). | Adopted by default ([portability.md](portability.md#3-google-play-console--data-safety-backup-exclusion--manifest-hygiene)) |
| **OQ-4** | Durable native store before first store release | Required Phase 6 release gate before first App Store / Play Store submission (SQLite `StorageAdapter` or mirrored auto-snapshot to native app Documents). | Adopted by default ([storage.md](storage.md#storage-durability--webkit-eviction-mitigation)) |
| **OQ-5** | GitHub Pages PR-preview publishing mechanism | Switch from `actions/deploy-pages` to plain `git` publishing on the `gh-pages` branch using `GITHUB_TOKEN` (Pages source = "Deploy from a branch" → `gh-pages`), preserving all mode-(a) guarantees (production root untouched, PR sub-path pruned on merge/close, zero third-party Pages actions). | **Adopted by default — flagged to the user for explicit confirmation** before Phase 5 deployment is enabled ([testing.md](testing.md#ci-workflow-mechanics-gh-pages-branch-publishing--prune-on-merge--production-unchanged)) |
