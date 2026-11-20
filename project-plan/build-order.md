# MVP Execution & Build Order

> Part of the [Budget App Plan](README.md). Codifies the **Iterative 5-Phase MVP Implementation Sequence** (Phases 1–3, Phases 4A–4D vertical slices, and Phase 5 release hardening) plus **Phase 6 (Native Shell Packaging & Store Submission)** from an empty codebase to shipped web and mobile releases, guaranteeing all **5 core engineering pillars** from the very first code commit:
> 1. **Security** (strict CSP `connect-src 'none'` + Trusted Types `require-trusted-types-for 'script'`, `<meta name="referrer" content="no-referrer">`, frame-buster guard, DOM XSS ban, base-path origin-isolated DB/cache naming, prototype-pollution-safe 10 MB backup validation, atomic IndexedDB restore, SHA-pinned CI actions / Dependabot / CodeQL / lockfile hygiene & WebView hardening)
> 2. **App Store & Play Store "Data Not Collected" Privacy** (100% on-device storage, zero network egress, iOS `ITSAppUsesNonExemptEncryption=false` + Xcode Privacy Report-derived `PrivacyInfo.xcprivacy`, Android `allowBackup="false"` + `dataExtractionRules` + `AD_ID` hygiene, Store Submission Checklist, E2E zero-egress network gate, zero-SDK OS-level crash/vitals monitoring)
> 3. **Build & Testing Best Practices** (strict TypeScript compiler baseline, `.nvmrc` + `pnpm-workspace.yaml`, `>= 95%` `src/core/` coverage via `@vitest/coverage-v8`, `fake-indexeddb` integration rollback tests, 3-viewport Chromium + WebKit Playwright E2E + `@axe-core/playwright` WCAG 2.2 AA scans co-shipped with every UI slice, post-build artifact gates, race-free mode-(a) `gh-pages` branch PR previews, SemVer release automation & rollback/roll-forward readiness, Dependabot)
> 4. **Modern Zero-Prod-Dep Tech Stack** (root web `dependencies: {}` + isolated `native/` workspace & `PlatformServices` runtime seam, Web-platform `IndexedDB` / `Intl` / `crypto.randomUUID` / CSS logical units / `<dialog>` / `BroadcastChannel`, custom Vite SW plugin with `updateViaCache: "none"` and no Workbox, short-month `Date.UTC` clamping + `12:00:00Z` due instant, honest storage durability via first-action `persist()`, `persisted()` status + backup nag, and OQ-4 durable native store gate)
> 5. **Post-MVP Extensibility** (`DB_VERSION = 1` schema migration switch with forward-only expand-and-contract safety, secondary IndexedDB indexes with no boolean index, `BudgetBackup` `schemaVersion: 1`, passphrase-encrypted backup envelope (`PBKDF2` + `AES-256-GCM`), reserved `deletedAt?`/`deviceId?` tombstones for E2EE sync, first-class CSV/OFX/QFX file import (`importBatchId`), and non-breaking seams for category envelopes, multi-period analytics, flexible cadences, split transactions, multi-account transfers, and opt-in bank sync that explicitly re-opens Pillar 2)

---

## Overview of the Iterative 6-Phase Sequence (Phases 1–3, 4A–4D, 5 MVP PWA + Phase 6 Native & Store Release)

```
Phase 1: Toolchain, Security/CSP Baseline & CI Gate Bootstrap
   │     (package.json ["dependencies": {}, version "0.1.0", engines, packageManager], .nvmrc, .npmrc [save-exact=true],
   │      pnpm-workspace.yaml [onlyBuiltDependencies, minimumReleaseAge], pnpm-lock.yaml,
   │      strict tsconfig.json, biome.json, vite.config.ts [VITE_BASE_PATH], vitest.config.ts [@vitest/coverage-v8],
   │      playwright.config.ts [@axe-core/playwright], index.html [CSP connect-src 'none' + Trusted Types + no-referrer],
   │      src/main.ts [frame-buster] + src/main.test.ts, .github/workflows/ci.yml [SHA-pinned actions, CodeQL, dependency-review],
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
   │      defensive non-destructive VersionError handling, first-action navigator.storage?.persist?.() + persisted() status],
   │      src/budgetApi.ts [exportBackup/importBackup], src/index.ts + fake-indexeddb integration & rollback tests)
   ▼
Phase 4A: Walking Skeleton — App Shell, PlatformServices Seam, Smoke E2E & Mode-(a) gh-pages Deploy
   │     (src/ui/ safe DOM helpers [zero innerHTML], src/platform/services.ts [PlatformServices + window.Capacitor seam],
   │      3-tab accessible shell [<nav role="tablist">, <dialog> helper], iPhone-Duo 375x667 / 829x1194 / 390x844 CSS frame,
   │      initial Chromium + WebKit Playwright smoke E2E [context.on("request") zero-egress + @axe-core/playwright + viewport geometry],
   │      .github/workflows/deploy-pages.yml [mode-(a) gh-pages PR previews (OQ-5) + prune-on-close + serialized concurrency])
   ▼
Phase 4B: Vertical Slice 1 — Budget Tab + Co-Shipped Playwright E2E
   │     (Available Funds header [aria-live="polite"], quick-add manual expense/deposit/income, activity feed/edit/backdate/tag,
   │      recurring rules drawer, Intl UTC-to-local TZ & integer-cent formatting,
   │      co-shipped Playwright E2E: cold start, recurring idempotency across reloads, manual flows, DOM XSS immunity)
   ▼
Phase 4C: Vertical Slice 2 — Insights & Settings Tabs + Co-Shipped Playwright E2E
   │     (Insights searchActivities & summarizeByTag rollups; Settings recurring rule management, persisted() status + N-day backup nag,
   │      pre-import File.size <= 10 MB check + confirm + safety snapshot via PlatformServices; base-path BroadcastChannel sync,
   │      co-shipped Playwright E2E: search/rollups, backup export/restore, corrupt/oversized/prototype-pollution rejection, multi-tab sync)
   ▼
Phase 4D: Offline PWA — Manifest, Custom Vite SW Plugin (updateViaCache: "none") & SW/Isolation E2E
   │     (manifest-relative public/manifest.webmanifest, custom Vite plugin emitting dist/sw.js [build hash, precache manifest,
   │      same-origin guard, pr-* bypass, updateViaCache: "none", user-accepted SKIP_WAITING update banner, non-overlapping cache cleanup,
   │      skipped in Capacitor], co-shipped Playwright E2E: offline reload, pr-<N>/ DB-name isolation, pr-* SW bypass, update banner)
   ▼
Phase 5: MVP Release Hardening, Versioning/Tagging/Changelog Automation, Rollback/Roll-Forward Verification & Native CI Scaffolding
   │     (full 3-viewport Chromium + WebKit regression E2E audit, .github/workflows/release.yml [manual SemVer package.json +
   │      annotated vX.Y.Z tags on main -> GitHub Releases + Conventional Commits changelog + immutable dist/ archive],
   │      workflow_dispatch tag re-deploy to gh-pages for same-schema PWA rollback, rollback/roll-forward verification checklist,
   │      .github/workflows/ci.yml [vars.NATIVE_BUILDS_ENABLED == 'true' native build job scaffolding])
   ▼
Phase 6: Native Shell Packaging (native/ Workspace), Store Compliance & Phased Mobile Releases (Post-MVP)
         (native/ workspace package [native/package.json, native/capacitor.config.ts webDir "../dist"],
          src/platform/services.ts [native window.Capacitor.Plugins bridge wiring & on-device verification], OQ-4 durable native store
          behind StorageAdapter, passphrase-encrypted backup envelope [PBKDF2 + AES-256-GCM] + biometric app lock,
          Android allowBackup="false" + dataExtractionRules [OQ-3], iOS Info.plist
          [ITSAppUsesNonExemptEncryption=false, WKAppBoundDomains] + Xcode-derived PrivacyInfo.xcprivacy,
          Store Submission Checklist, native SemVer/build-number versioning, Apple Phased Release & Google Play Staged Rollout)
```

---

## Why This Sequence Is Optimal

1. **Security & CI gates precede all application code (Phase 1 first):** Establishing `"dependencies": {}` CI enforcement, `.npmrc` `save-exact=true`, strict TypeScript compiler flags, Biome linting, the `<meta http-equiv="Content-Security-Policy">` baseline (`connect-src 'none'`), post-build artifact scanners, and GitHub branch protection on `main` in Phase 1 guarantees that no subsequent task PR can ever merge an unsafe runtime dependency, type error, DOM XSS sink, or external network URL.
2. **Pure financial & validation logic precedes I/O and UI (Phase 2 before Phases 3–4):** Implementing `src/core/` as 100% pure, platform-agnostic TypeScript with `>= 95%` unit test coverage isolates integer-cent arithmetic (`amountCents`), recurring period idempotency, short-month `Date.UTC` clamping (`dayOfMonth` 29–31), and untrusted JSON backup validation (`validateBackupPayload`) before introducing asynchronous IndexedDB transactions or DOM event listeners.
3. **Storage & `BudgetApi` contract precede UI (Phase 3 before Phase 4A):** Verifying `IndexedDbAdapter` (`DB_VERSION = 1`, secondary indexes, single-transaction atomic `replaceAll` rollback, defensive `VersionError` handling) and `createBudgetApi` (`exportBackup` / `importBackup`) against `fake-indexeddb` ensures that every UI vertical slice consumes a completely stable, transactionally safe persistence contract.
4. **Walking skeleton + iterative vertical slices with co-shipped E2E beat a monolithic UI phase (Phases 4A–4D):** Pulling the App Shell, `PlatformServices` seam, Chromium/WebKit zero-egress + `@axe-core/playwright` smoke E2E, and `.github/workflows/deploy-pages.yml` to the very front (**Phase 4A**) proves WebKit CSP/Trusted Types, `svh`/`dvh` layout invariants, and live PR previews before any feature tab is written. Co-shipping Playwright E2E with each vertical slice (**4B** Budget, **4C** Insights & Settings, **4D** Offline PWA & SW) aligns with our serial, feature-branch-per-story workflow and `C12` E2E co-authoring rule, keeps every story branch right-sized, and delivers working software to `main` on every merge.
5. **Release automation, rollback/roll-forward readiness & cross-journey hardening close the MVP loop (Phase 5 → Phase 6):** Dedicating **Phase 5** to cross-viewport regression verification, SemVer tagging/changelog automation (`.github/workflows/release.yml`), tag-based same-schema rollback drills, and credential-gated native CI job scaffolding prepares both the production PWA and Phase 6 native mobile store submissions without bloating earlier UI stories.

---

## Story-Sizing & Iterative Agent-Execution Map

Our multi-agent orchestration workflow runs **serially with one feature branch per Story** (`product-manager` → `project-manager` → `solutions-architect` / `software-engineer` → `senior-software-engineer` → `staff-software-engineer` → `qa` → `docs-agent` → merge to `main`) and enforces the **`C12` E2E co-authoring rule** (every UI story ships its own Playwright E2E tests in the same story). Mapping Phases 1–5 to **8 right-sized MVP Stories** (capped at ~2–5 tasks each) avoids oversized feature branches, minimizes rebase churn, and provides early QA feedback on `main`:

| MVP Story | Build Phase | Target Scope (Vertical Slice / Layer) | Typical Size | Co-Shipped Verification / E2E Gate |
| --------- | ----------- | ------------------------------------- | ------------ | ---------------------------------- |
| **Story 1** | **Phase 1** | Toolchain, Security/CSP Baseline (`index.html`, `src/main.ts`), SemVer `0.1.0`, `.github/workflows/ci.yml`, `.github/dependabot.yml` | 2–4 tasks | `biome check`, `tsc --noEmit`, `vitest run`, `vite build`, post-build CSP/XSS/zero-external-URL/zero-prod-dep gates, `pnpm audit` |
| **Story 2** | **Phase 2** | Pure Core Domain (`src/core/types.ts`, `validate.ts`, `engine.ts`, `funds.ts`, `insights.ts`) | 3–4 tasks | `vitest run --coverage` with `>= 95%` line & branch coverage on `src/core/` |
| **Story 3** | **Phase 3** | Storage Layer (`src/storage/adapter.ts`, `memory.ts`, `indexeddb.ts` with `DB_VERSION = 1` & `VersionError` handling) & Public `BudgetApi` (`src/budgetApi.ts`, `src/index.ts`) | 2–4 tasks | `fake-indexeddb` integration & atomic `replaceAll` rollback tests + built `dist/` smoke import |
| **Story 4** | **Phase 4A** | **Walking Skeleton:** Safe DOM helpers, `src/platform/services.ts` (`PlatformServices` seam), 3-tab accessible shell + `<dialog>` helper, iPhone-Duo CSS frame, `.github/workflows/deploy-pages.yml` | 3–4 tasks | Initial Chromium + WebKit Playwright smoke E2E (`context.on("request")` zero-egress, `@axe-core/playwright` WCAG 2.2 AA, 3-viewport zero-overflow geometry) + live `gh-pages` PR preview |
| **Story 5** | **Phase 4B** | **Vertical Slice 1 — Budget Tab:** Available Funds, quick-add manual expense/deposit/income, activity feed/edit/backdate/tagging, recurring rules drawer, `Intl` formatting | 3–4 tasks | Co-shipped Playwright E2E (`C12`): cold start, recurring idempotency across reloads, manual CRUD/edit/backdate, DOM XSS immunity (`textContent`) |
| **Story 6** | **Phase 4C** | **Vertical Slice 2 — Insights & Settings Tabs:** `searchActivities` / `summarizeByTag` UI, recurring rule management, `persisted()` + N-day backup nag, backup export/import + pre-import safety snapshot, `BroadcastChannel` sync | 3–5 tasks | Co-shipped Playwright E2E (`C12`): Insights filters/rollups, valid export/restore, corrupt/oversized/prototype-pollution rejection, pre-import confirm + snapshot, multi-tab `BroadcastChannel` refresh |
| **Story 7** | **Phase 4D** | **Offline PWA:** Manifest-relative `public/manifest.webmanifest` + custom Vite SW plugin (`dist/sw.js`, `updateViaCache: "none"`, `pr-*` bypass, `SKIP_WAITING` update banner) | 2–3 tasks | Co-shipped Playwright E2E (`C12`): offline reload (`setOffline(true)`), `pr-<N>/` DB-name isolation, `pr-*` SW bypass, cache-version cleanup & update-banner activation |
| **Story 8** | **Phase 5** | **MVP Release Hardening & Automation:** Full cross-journey regression audit, `.github/workflows/release.yml` (SemVer `vX.Y.Z` tags + changelog + `dist/` archive), `workflow_dispatch` tag re-deploy rollback, native CI job scaffolding | 2–4 tasks | Full 3-viewport Chromium + WebKit E2E regression pass, rollback/roll-forward checklist verification, credential-gated native CI skip-not-fail check |
| **Post-MVP Stories** | **Phase 6** | Native Shell Packaging (`native/` workspace), durable native store (OQ-4), encrypted backup envelope & biometric lock, store compliance & phased mobile releases | 3–5 tasks / story | Native CI builds (`vars.NATIVE_BUILDS_ENABLED == 'true'`), Xcode Privacy Report audit, Store Submission Checklist & phased/staged rollout readiness |

---

## Phase-by-Phase Specification

### Phase 1 — Toolchain, Security/CSP Baseline & CI Gate Bootstrap

- **Scope & Target Files:**
  - `package.json` (`"dependencies": {}`, `"version": "0.1.0"` SemVer baseline, `"engines": { "node": "..." }`, `packageManager: "pnpm@..."` using a pnpm 10+ release that supports npm's bulk audit endpoint, exact current `devDependencies` majors decided at bootstrap including `@vitest/coverage-v8` and `@axe-core/playwright`, scripts for `build`, `test`, `test:e2e`, `lint`, `typecheck`)
  - `.nvmrc` (current Active-LTS even Node.js release verified from `nodejs.org` at bootstrap, referenced by CI via `node-version-file: '.nvmrc'`)
  - `.npmrc` (`save-exact=true`), `pnpm-workspace.yaml` (`onlyBuiltDependencies` e.g. `esbuild`, `minimumReleaseAge` cooldown), and `pnpm-lock.yaml`
  - `tsconfig.json` (with all mandatory strict flags from [dependency-strategy.md](dependency-strategy.md#strict-typescript-compiler-flags-tsconfigjson))
  - `biome.json` (lint + format rules)
  - `vite.config.ts` (`base: process.env.VITE_BASE_PATH ?? "/simple-budget-app/"`)
  - `vitest.config.ts` (enforcing `>= 95%` line & branch coverage threshold on `src/core/` via `@vitest/coverage-v8`)
  - `playwright.config.ts` (configuring `375×667` folded, `829×1194` unfolded, and `390×844` secondary slab projects across headless Chromium and WebKit against `vite preview`, with `@axe-core/playwright` available for WCAG 2.2 AA scans)
  - `index.html` (with the strict `<meta http-equiv="Content-Security-Policy">` tag including `connect-src 'none'`, `require-trusted-types-for 'script'`, and `trusted-types sw-register` (Trusted Types defense-in-depth), plus `<meta name="referrer" content="no-referrer">` per [frontend.md](frontend.md#1-strict-content-security-policy-indexhtml))
  - Minimal `src/main.ts` bootstrap shell (including the 3-line `top !== self` frame-buster guard per [frontend.md](frontend.md#1-strict-content-security-policy-indexhtml), since `script-src 'self'` blocks inline `<script>` in `index.html`) + initial colocated smoke unit test (`src/main.test.ts`)
  - `.github/workflows/ci.yml` (all `uses:` actions full-40-char-SHA pinned `# vX.Y.Z`, `pnpm/action-setup` without assuming `corepack`, `actions/setup-node` with `node-version-file: '.nvmrc'`, least-privilege `permissions: contents: read`, post-build CSP/XSS/zero-external-URL/zero-prod-dep gates, `pnpm audit --audit-level=high`, `actions/dependency-review-action`, and CodeQL via `github/codeql-action` per [testing.md](testing.md#the-test-pyramid-who-does-what--when))
  - `.github/dependabot.yml` (`github-actions` and `npm` ecosystems)
  - GitHub repository settings: branch protection rules on `main` and **"Require actions to be pinned to a full-length commit SHA"** enabled
- **Dependencies:** None (first code implementation phase).
- **Why This Order (Pillars 1–5 Alignment):** Locks in Pillar 1 (supply-chain hygiene, CSP `connect-src 'none'`, DOM XSS CI ban), Pillar 2 (zero external asset URLs in `dist/`), Pillar 3 (deterministic lockfile, strict TS, CI gates, SemVer baseline), and Pillar 4 (modern Vite + Vitest + Biome + Playwright toolchain) before feature code begins.
- **Enforced Security, Privacy & Test Invariants:**
  - `Object.keys(pkg.dependencies ?? {}).length === 0`
  - Zero `@capacitor/*` imports in `src/` (native shell wrappers live strictly in `native/package.json` in Phase 6)
  - `dist/index.html` contains `http-equiv="Content-Security-Policy"`, `connect-src 'none'`, `require-trusted-types-for 'script'`, `trusted-types sw-register`, and `<meta name="referrer" content="no-referrer">` (and omits `frame-ancestors` in `<meta>` so browsers log zero console warnings)
  - Zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `document.writeln`, `eval(`, or `new Function` in `src/`
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
  - `src/core/types.ts` (`RecurringRule`, `NewRule`, `Activity`, `NewActivity`, `RulePatch`, `ActivityPatch`, `BudgetBackup`, `ActivitySearchFilter`, `ActivityFilter`, `TagSummary`, and post-MVP reserved fields `importBatchId`, `source: "file-import"` / `"bank-sync"`, `externalTxnId`, `sourceAccountId`, plus E2EE sync tombstone slots `deletedAt?` / `deviceId?`)
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
  - `src/storage/indexeddb.ts` (`IndexedDbAdapter` with base-path-derived `DB_NAME` (`deriveDbName(import.meta.env.BASE_URL)`), `DB_VERSION = 1`, `onupgradeneeded(event)` sequential migration switch, `"meta"` (schema + `lastBackupAt`) / `"rules"` (in-memory filtering for active vs. paused; no boolean index) / `"activities"` object stores, secondary indexes `by_dateTime`, `by_type`, `by_tags` (`multiEntry: true`), and compound `by_rule_period` (`["sourceRuleId", "period"]`), single-transaction atomic `replaceAll`, defensive non-destructive `VersionError` handling (never calling `indexedDB.deleteDatabase()`), best-effort `navigator.storage?.persist?.()` triggered after the first user write/action, and `navigator.storage?.persisted?.()` status readout per [storage.md](storage.md#indexeddb-schema-versioning-indexes--migration-strategy))
  - `src/budgetApi.ts` (`createBudgetApi` implementing `BudgetApi`, including `exportBackup()` recording `lastBackupAt` in `"meta"` and `importBackup(json: string)` with pre-import confirmation + auto-snapshot contract per [storage.md](storage.md#atomic-backup-restoration-replaceall) and [portability.md](portability.md#the-public-api-what-the-front-end-calls))
  - `src/index.ts` (public library exports)
  - Integration test suite (`src/storage/*.test.ts` using `fake-indexeddb`)
- **Dependencies:** Phase 2.
- **Why This Order (Pillars 1–5 Alignment):** Combines Pillar 1 (atomic all-or-nothing backup restoration with pre-import safety), Pillar 2 (100% local IndexedDB persistence with zero cloud calls), Pillar 4 (honest browser/WebView durability via first-action `navigator.storage?.persist?.()`, `persisted()` status + N-day backup nag in Settings, and the OQ-4 durable native store release gate for store builds), and Pillar 5 (`DB_VERSION = 1` migration switch, defensive `VersionError` handling, secondary indexes, and reserved `deletedAt?`/`deviceId?` slots for post-MVP scale) into the single `BudgetApi` façade before UI work begins.
- **Enforced Security, Privacy & Test Invariants:**
  - `importBackup(json)` validates the entire payload in memory via `validateBackupPayload(json)` (with UI `File.size <= 10 MB` pre-read check, confirmation dialog, and pre-import safety snapshot) **before** calling `storage.replaceAll(...)`
  - `replaceAll` executes inside a single IndexedDB `readwrite` transaction spanning `["rules", "activities"]`; any error aborts the transaction and leaves prior stored data completely intact
  - `IndexedDbAdapter` catches `VersionError` non-destructively (surfacing an update-required error to the UI) and never calls `indexedDB.deleteDatabase()` on user financial data
  - `init()` opens the store only (without running `runRecurringEngine()` or calling `persist()` prematurely — callers invoke `budget.runRecurringEngine()` explicitly on app start/focus per [portability.md](portability.md#the-public-api-what-the-front-end-calls)); `navigator.storage?.persist?.()` is invoked best-effort after the first user write/action (never throwing if unsupported), and `navigator.storage?.persisted?.()` + `getLastBackupAt()` are exposed for Settings
  - **Store-release durability gate (OQ-4):** IndexedDB is the MVP PWA store; before the first App Store / Play Store submission, a durable native store (SQLite `StorageAdapter` or mirrored auto-snapshot to native app Documents) is required behind `StorageAdapter`
- **Executable Verification Gates:**
  - `pnpm test` passing all `fake-indexeddb` integration tests in [testing.md](testing.md#3-mandatory-storage--api-integration-scenarios-fake-indexeddb) (cold/warm start, `DB_VERSION = 1` store & index creation with no boolean index, listing active vs. paused recurring rules via in-memory filtering, atomic `replaceAll` rollback leaving prior data intact on simulated write failure, defensive `VersionError` handling, first-action `persist()` + `persisted()` + `lastBackupAt` tracking, index lookups, and built-bundle `dist/` smoke import).

---

### Phase 4A — Walking Skeleton: App Shell, `PlatformServices` Seam, Smoke Playwright E2E & Mode-(a) `gh-pages` Deploy (`src/ui/`, `src/platform/`, `src/styles/`, `e2e/`, `.github/workflows/deploy-pages.yml`)

- **Scope & Target Files:**
  - Safe DOM construction helper layer in `src/ui/` (strictly `document.createElement`, `node.textContent`, `element.setAttribute`, `element.replaceChildren` — zero `innerHTML` / `outerHTML` / `insertAdjacentHTML` per [frontend.md](frontend.md#2-dom-xss-ban-safe-dom-apis-only))
  - `src/platform/services.ts` (`PlatformServices` interface — `saveBackup`, `shareBackup`, `isNative` — plus web/PWA implementation and `window.Capacitor` runtime feature-detection seam so Settings backup export and pre-import safety snapshots delegate through `PlatformServices` without importing `@capacitor/*` in `src/` per [portability.md](portability.md#package-boundary--platformservices-seam))
  - Accessible 3-tab application shell (`<nav role="tablist">`, `<button role="tab" aria-selected>`, native `<dialog>` helper, WCAG 2.2 AA focus & `>= 44×44 CSS px` touch-target semantics per [frontend.md](frontend.md#1-semantic-html--wcag-22-aa-accessibility))
  - `src/styles/` iPhone-Duo dual-state responsive CSS frame (`375×667` folded 1-page baseline + `829×1194` unfolded split-pane enhanced view + `390×844` slab phone target, logical viewport units `svh`/`dvh`, `env(safe-area-inset-*)`, zero vertical/horizontal page scroll per [frontend.md](frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2))
  - Initial Playwright smoke E2E harness (`e2e/smoke.spec.ts` + shared zero-egress/console/axe fixtures) running against `vite preview` of `dist/` on **Chromium + WebKit** across all 3 viewports (`375×667`, `829×1194`, `390×844`): global `context.on("request")` zero-external-egress gate, zero `pageerror` / console error/warning gate, `@axe-core/playwright` WCAG 2.2 AA scan, and viewport overflow + touch-target geometry assertions per [testing.md](testing.md#4-mandatory-playwright-e2e-security-privacy--viewport-scenarios-e2espects)
  - `.github/workflows/deploy-pages.yml` strictly for GitHub Pages deploy/preview/prune: mode-(a) same-site sub-path PR previews via plain `git` publishing to the `gh-pages` branch using `GITHUB_TOKEN` (OQ-5 — **flagged to the user for confirmation**; Pages source = "Deploy from a branch" → `gh-pages`; PR triggers restricted to PRs targeting `main`; preview job writes only `pr-<PR#>/`; close job runs `git rm -rf pr-<PR#>/`; `main` push writes root files excluding `pr-*/`; `contents: write` on the publish job only; `concurrency: { group: "pages-deploy", cancel-in-progress: false }`; no third-party Pages action) per [testing.md](testing.md#ci-deploy--preview-github-pages)
- **Dependencies:** Phase 3.
- **Why This Order (Pillars 1–5 Alignment):** Proves browser/WebKit CSP + Trusted Types compliance, `svh`/`dvh` layout invariants, `VITE_BASE_PATH` routing, zero-egress E2E automation, and live `gh-pages` PR previews before writing feature tabs — catching cross-browser and deployment issues at the lowest possible cost.
- **Enforced Security, Privacy & Test Invariants:**
  - Zero `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / `document.writeln` / `eval` / `new Function` and zero `@capacitor/*` imports across `src/`
  - Zero remote fonts, CDNs, or icon requests (system font stack and local bundled SVG/CSS assets only)
  - Zero page-level vertical or horizontal overflow (`scrollHeight <= window.innerHeight`, `scrollWidth <= window.innerWidth`) across all 3 viewports
  - Serialized `gh-pages` publishing (`cancel-in-progress: false`) with `contents: write` scoped strictly to the publish job
- **Executable Verification Gates:**
  - `pnpm run build` + post-build CI security/artifact checks
  - `pnpm test` passing shell & `PlatformServices` unit tests
  - `pnpm exec playwright test` passing Chromium + WebKit smoke, zero-egress, WCAG 2.2 AA axe, and 3-viewport geometry gates (headless CLI, no hanging dev servers per [testing.md](testing.md#headless--cli-execution-rule-no-hanging-dev-servers)).

---

### Phase 4B — Vertical Slice 1: Budget Tab + Co-Shipped Playwright E2E (`src/ui/`, `e2e/`)

- **Scope & Target Files:**
  - `src/ui/` **Budget** tab view controller: Available Funds header (`aria-live="polite"`), quick-add manual expense/deposit/income form, activity feed with edit/backdate/delete/tagging modal (`<dialog>`), and recurring rules drawer/sheet
  - `Intl.DateTimeFormat` UTC-to-local timezone rendering and `Intl.NumberFormat` integer-cent formatting (`src/ui/` format helpers)
  - Co-shipped Playwright E2E specs (`e2e/budget.spec.ts`, `C12` rule) covering cold-start initialization, recurring rule creation & idempotent auto-posting across reloads, manual expense/deposit/income creation, activity editing/backdating/tagging, and DOM XSS payload immunity (`<img src=x onerror=window.__xss=1>`, `<script>window.__xss=1</script>` rendered as inert literal text via `textContent`), plus `@axe-core/playwright` scans on the Budget tab and open `<dialog>` modals
- **Dependencies:** Phase 4A.
- **Why This Order (Pillars 1–5 Alignment):** Delivers a real, end-to-end usable budget application to `main` early, with immediate Chromium + WebKit E2E proof of financial math rendering, recurring idempotency, and DOM XSS immunity.
- **Enforced Security, Privacy & Test Invariants:**
  - Safe DOM APIs only (`textContent`, never `innerHTML`) — all untrusted user titles/notes/tags render as inert text
  - Integer-cent money formatting at the display boundary only; UTC instants rendered in local timezone via `Intl.DateTimeFormat`
  - Zero external egress, zero console/page errors, zero viewport overflow, and zero WCAG 2.2 AA axe violations on Budget views and dialogs
- **Executable Verification Gates:**
  - `pnpm test` passing Budget UI controller & formatter unit tests
  - `pnpm run build && pnpm exec playwright test` passing all Budget + XSS + Smoke E2E specs on Chromium + WebKit across all 3 viewports.

---

### Phase 4C — Vertical Slice 2: Insights & Settings Tabs + Co-Shipped Playwright E2E (`src/ui/`, `e2e/`)

- **Scope & Target Files:**
  - `src/ui/` **Insights** tab view controller: period + tag + type search filter (`searchActivities`) and tag-based rollups (`summarizeByTag`)
  - `src/ui/` **Settings** tab view controller: recurring rule management, `navigator.storage.persisted()` status readout + N-day backup-age nag from `budget.getLastBackupAt()`, and JSON backup export/import via `budget.exportBackup()` / `budget.importBackup(json)` with pre-read `File.size <= 10 MB` check, confirmation `<dialog>`, and automatic pre-import safety snapshot via `PlatformServices`
  - Base-path-scoped `BroadcastChannel` (`"simple-budget-sync"` on production, `"simple-budget-sync-pr-<N>"` on PR previews, derived from `import.meta.env.BASE_URL` under OQ-1) cross-tab state refresh listener/emitter per [frontend.md](frontend.md#2-multi-tab-state-synchronization-broadcastchannel)
  - Co-shipped Playwright E2E specs (`e2e/insights-settings.spec.ts`, `C12` rule) covering `searchActivities` & `summarizeByTag` Insights filtering, JSON backup export → corrupt/oversized/prototype-polluting import rejection (existing data preserved) → pre-import confirmation + safety snapshot → valid restore, `persisted()` status display, multi-tab `BroadcastChannel` refresh, and `@axe-core/playwright` WCAG 2.2 AA scans on Insights and Settings tabs
- **Dependencies:** Phase 4B.
- **Why This Order (Pillars 1–5 Alignment):** Completes all MVP functional user journeys (Insights analytics, safe backup/restore with pre-import snapshot, honest storage durability status, and cross-tab sync) while keeping every feature verified by co-shipped E2E tests.
- **Enforced Security, Privacy & Test Invariants:**
  - Pre-read `File.size <= 10,485,760` byte check, confirmation dialog, and automatic pre-import safety snapshot via `PlatformServices` before calling `budget.importBackup(json)`
  - Corrupt, oversized, or prototype-polluting JSON backups fail cleanly with prior stored data completely intact
  - Base-path-scoped `BroadcastChannel` isolates production and PR preview tabs on the shared `tandyn.github.io` origin
- **Executable Verification Gates:**
  - `pnpm test` passing Insights, Settings, and `BroadcastChannel` unit/controller tests
  - `pnpm run build && pnpm exec playwright test` passing all Insights, Settings, Backup/Restore, Multi-Tab, Budget, and Smoke E2E specs on Chromium + WebKit across all 3 viewports.

---

### Phase 4D — Offline PWA: Manifest, Custom Vite SW Plugin (`updateViaCache: "none"`) & SW/Isolation E2E (`public/`, Vite SW plugin, `e2e/`)

- **Scope & Target Files:**
  - Manifest-relative `public/manifest.webmanifest` (`"start_url": "./"`, `"scope": "./"`, and relative icon `src` paths resolving against the manifest URL under any base path without Vite `BASE_URL` substitution)
  - Custom in-repo Vite plugin emitting `dist/sw.js` at build time (NOT a static `public/sw.js` and NOT `vite-plugin-pwa`/Workbox, keeping `dependencies: {}`) with the build hash + precache manifest, base-path-derived versioned cache name (`sbapp-<buildhash>` for production / `sbapp-pr-<N>-<buildhash>` for PR previews), strict same-origin guard (`new URL(event.request.url).origin === self.location.origin`), `pr-*` sub-path bypass on the production SW, old-cache cleanup on `activate` (preserving sibling `sbapp-pr-*` caches), `skipWaiting` invoked **only** after the user accepts an "Update available" banner, network-first navigations with cache fallback, SW registration passing **`{ updateViaCache: "none" }`** (overriding GitHub Pages' default 10-minute `Cache-Control` so rollbacks/updates detect immediately), and SW registration skipped inside Capacitor native shells per [frontend.md](frontend.md#service-worker-design-pwa-offline-scoping--update-lifecycle)
  - Co-shipped Playwright E2E specs (`e2e/pwa-offline.spec.ts`, `C12` rule) covering offline reload (`context.setOffline(true)` after initial load in Chromium), `pr-<N>/` build IndexedDB name isolation (`simple-budget-app-pr-<N>` vs. `simple-budget-app`), `pr-*` SW bypass, and cache-version cleanup + update-banner activation
- **Dependencies:** Phase 4C.
- **Why This Order (Pillars 1–5 Alignment):** Isolates the trickiest browser-lifecycle and shared-origin caching surface into its own focused story with dedicated offline/isolation/update E2E verification, without adding Workbox or any runtime dependency.
- **Enforced Security, Privacy & Test Invariants:**
  - Root `package.json` `dependencies` remains `{}` (zero Workbox / `vite-plugin-pwa`)
  - SW registration uses Trusted Types (`sw-register` policy) and `{ updateViaCache: "none" }`, and is skipped when `window.Capacitor` is present
  - Production SW never intercepts `/simple-budget-app/pr-*` sub-paths and never deletes sibling `sbapp-pr-*` caches
- **Executable Verification Gates:**
  - `pnpm run build` emitting `dist/sw.js` with embedded build hash & precache manifest, passing all post-build CI checks
  - `pnpm exec playwright test` passing offline reload, preview DB-name isolation, `pr-*` SW bypass, and update-banner E2E specs alongside the full suite.

---

### Phase 5 — MVP Release Hardening, Versioning/Tagging/Changelog Automation, Rollback/Roll-Forward Verification & Native CI Scaffolding (`.github/workflows/release.yml`, `deploy-pages.yml`, `ci.yml`, `e2e/`)

- **Scope & Target Files:**
  - Full cross-journey Playwright E2E regression audit across **Chromium + WebKit** and all 3 mandatory viewports (`375×667` folded, `829×1194` unfolded, `390×844` secondary slab), verifying zero external egress (`context.on("request")`), zero console/page errors, zero WCAG 2.2 AA `@axe-core/playwright` violations, and full offline/isolation coverage per [testing.md](testing.md#4-mandatory-playwright-e2e-security-privacy--viewport-scenarios-e2espects)
  - `.github/workflows/release.yml`: triggered by annotated SemVer git tags `vX.Y.Z` on `main` (matching `package.json` `version` — adopted default from Spike #199: manual SemVer in `package.json` + annotated `vX.Y.Z` tags, zero extra third-party release bots). Runs full lint/typecheck/test/build/E2E gates, packages an immutable `dist/` release archive, and publishes a GitHub Release with an automated Conventional Commits changelog
  - `.github/workflows/deploy-pages.yml` extended with `workflow_dispatch` tag re-deploy (`ref: vX.Y.Z`) to rebuild and re-publish a known-good tag to the `gh-pages` root (preserving `pr-*/`) for fast same-schema PWA rollback
  - Rollback / roll-forward verification checklist (validating same-schema `workflow_dispatch` tag rollback + `updateViaCache: "none"` SW cache swap, documenting the Emergency No-Op / Kill-Switch SW roll-forward procedure, and confirming non-destructive `VersionError` / forward-only `DB_VERSION = N + 1` readiness)
  - `.github/workflows/ci.yml` extended with optional skip-not-fail credential-gated Android/iOS native build job scaffolding (`if: ${{ vars.NATIVE_BUILDS_ENABLED == 'true' }}`), strictly separated from `deploy-pages.yml` per [testing.md](testing.md#android--ios-test-build-pipeline-credential-skip-build-only)
- **Dependencies:** Phase 4D.
- **Why This Order (Pillars 1–5 Alignment):** Closes the MVP release loop with repeatable SemVer tagging/changelog automation, tested rollback/roll-forward recovery procedures, full cross-viewport/cross-engine E2E sign-off, and ready-to-enable native CI scaffolding for Phase 6.
- **Enforced Security, Privacy & Test Invariants:**
  - Mathematical E2E proof of zero external network requests (`new URL(req.url()).origin === previewOrigin`), directly substantiating Apple App Store Connect "Data Not Collected" and Google Play Console "No data shared / No data collected" declarations
  - All actions in `release.yml`, `deploy-pages.yml`, and `ci.yml` full-40-char SHA-pinned with least-privilege `permissions:`
  - Same-schema rollback re-deploys preserve `pr-*/` on `gh-pages` and never touch user IndexedDB data; `Clear-Site-Data` is never used
  - Native mobile jobs live in `.github/workflows/ci.yml` (separate from `deploy-pages.yml`) and are gated at job level by `if: ${{ vars.NATIVE_BUILDS_ENABLED == 'true' }}` (no `secrets` or `env` in job-level `if:`; signing secrets mapped to step `env:` inside the job — skip-not-fail when disabled, build-only when enabled, matching [testing.md](testing.md#android--ios-test-build-pipeline-credential-skip-build-only) identically)
- **Executable Verification Gates:**
  - `pnpm exec playwright test` passing 100% of E2E specs on Chromium + WebKit across all 3 viewports (`375×667`, `829×1194`, `390×844`) with zero console errors/warnings, zero page errors, and zero external network requests (headless CLI per [testing.md](testing.md#headless--cli-execution-rule-no-hanging-dev-servers))
  - `.github/workflows/release.yml` and `deploy-pages.yml` `workflow_dispatch` tag re-deploy verified cleanly on a dry-run / pre-release tag, and `ci.yml` native jobs verified skip-not-fail when `NATIVE_BUILDS_ENABLED` is unset.

---

### Phase 6 — Native Shell Packaging (`native/` Workspace), Store Compliance & Phased Mobile Releases (Post-MVP Store Release)

- **Scope & Target Files:**
  - `native/package.json` and `native/capacitor.config.ts` (`webDir: "../dist"`, `server.allowNavigation: []`, `android.allowMixedContent: false`, `android.webContentsDebuggingEnabled: false`, and `ios.limitsNavigationsToAppBoundDomains: true` paired with `WKAppBoundDomains` in `Info.plist`, or flag omitted cleanly per [portability.md](portability.md#4-capacitor-webview-runtime-hardening-nativecapacitorconfigts)) — isolated workspace package so the root web bundle package keeps `"dependencies": {}` and never imports `@capacitor/*`
  - `src/platform/services.ts` native `window.Capacitor.Plugins` bridge wiring and on-device verification behind the Phase 4A `PlatformServices` seam (`saveBackup`, `shareBackup`, `isNative`) so `dist/` stays identical across PWA, iOS, and Android per [portability.md](portability.md#package-boundary--platformservices-seam)
  - Durable native store adapter wired behind `StorageAdapter` (OQ-4 release gate: SQLite `StorageAdapter` or mirrored auto-snapshot to native app Documents per [storage.md](storage.md#why-a-storage-adapter))
  - Passphrase-encrypted backup export (WebCrypto `AES-256-GCM` + `PBKDF2-HMAC-SHA256` with `600_000..5_000_000` iterations — OWASP floor + CWE-400 upper bound — versioned `{ schemaVersion, enc: { alg, kdf, iter, salt, iv }, ciphertext }` envelope per [data-model.md](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)) and optional native biometric app lock (also mitigating Apple Guideline 4.2)
  - `native/android/app/src/main/AndroidManifest.xml` (`android:allowBackup="false"`, `android:fullBackupContent="false"`, `android:dataExtractionRules="@xml/data_extraction_rules"`, `AD_ID` omitted/removed) and `native/android/app/src/main/res/xml/data_extraction_rules.xml` excluding `cloud-backup` and `device-transfer` (OQ-3)
  - `native/ios/App/App/Info.plist` (`ITSAppUsesNonExemptEncryption = false`, matching `WKAppBoundDomains` if enabled) and `native/ios/App/App/PrivacyInfo.xcprivacy` derived from Xcode's **"Generate Privacy Report"** on the release archive
  - Native versioning & phased/staged store release process: iOS `CFBundleShortVersionString` = SemVer `X.Y.Z` + monotonically increasing `CFBundleVersion` with Apple 7-day **Phased Release** (pause + roll-forward hotfix / Expedited Review); Android `versionName` = SemVer `X.Y.Z` + strictly monotonically increasing `versionCode` with Google Play **Staged Rollout** (Halt Rollout + roll-forward hotfix); OS-level App Store Connect Crashes & Android Vitals zero-SDK monitoring
  - Store submission artifacts per [portability.md → Store Submission Checklist](portability.md#store-submission-checklist-phase-6): public privacy policy URL, Apple App Store Review Notes (Guideline 4.2 mitigation), Google Play Financial features declaration, Data safety form (including backup posture), and Google Play 12-tester / 14-day closed test (verify current policy at submission)
- **Dependencies:** Phase 5.
- **Why This Order (Pillars 1–5 Alignment):** Keeps the MVP PWA (Phases 1–5) zero-prod-dep and fast to ship while ensuring store-distributed mobile builds meet every security, durability (OQ-4), backup-isolation (OQ-3), privacy-manifest, phased-rollout, and store-review requirement before first submission.
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

## Release, Versioning & Rollback / Roll-Forward Summary

Because this is a **local-first, zero-server** financial app distributed both as a GitHub Pages PWA (Phases 1–5) and later as native App Store / Play Store binaries (Phase 6), release versioning and recovery mechanics must explicitly respect IndexedDB schema safety, Service Worker update caching, and mobile store constraints (detailed per-area specs live in [testing.md](testing.md), [frontend.md](frontend.md), [storage.md](storage.md), and [portability.md](portability.md)):

- **Versioning (Single Source of Truth — Adopted Default from Spike #199):**
  - Maintain SemVer `X.Y.Z` manually in root `package.json` (starting at `0.1.0` in Phase 1) and cut annotated git tags `vX.Y.Z` on `main`.
  - Pushing a `vX.Y.Z` tag triggers `.github/workflows/release.yml` automatically (zero extra third-party release bots/actions, preserving Pillar 1's minimal-action supply-chain posture) to run full verification gates, archive the immutable `dist/` bundle, and publish a GitHub Release with a Conventional Commits changelog.
  - Phase 6 native builds map SemVer directly: iOS `CFBundleShortVersionString = X.Y.Z` + monotonically increasing integer `CFBundleVersion`; Android `versionName = X.Y.Z` + strictly monotonically increasing integer `versionCode`.
- **Web / PWA (GitHub Pages) Rollback vs. Roll-Forward Matrix:**
  1. **Same-schema app bug (`DB_VERSION` unchanged — all v1.x MVP releases):** Fast tag-based **rollback** is safe. Trigger `.github/workflows/deploy-pages.yml` via `workflow_dispatch` with `ref: vX.Y.Z` (last known-good tag) — or `git revert` on `main` — to rebuild and re-publish root files to `gh-pages` (preserving `pr-*/`). Because `dist/sw.js` embeds `<buildhash>`, the rolled-back `sw.js` is byte-different; `{ updateViaCache: "none" }` bypasses GitHub Pages' 10-minute default HTTP cache for immediate update detection, and activating the known-good SW prunes the bad `sbapp-<badhash>` cache while keeping `sbapp-pr-*` untouched.
  2. **Broken Service Worker emergency (bad `sw.js` blocking updates or breaking fetch):** **Roll forward** an Emergency No-Op / Kill-Switch `sw.js` at the same URL (`self.skipWaiting()` in `install`, prune production `sbapp-*` caches excluding `sbapp-pr-*`, and unregister/reload clients in `activate`). Never use `Clear-Site-Data` (GitHub Pages cannot set custom headers, and `Clear-Site-Data: "storage"` would wipe user IndexedDB financial data).
  3. **Post-schema-bump bug (`DB_VERSION` increased, e.g. `1 → 2` in post-MVP):** **Roll-forward only.** Never deploy code with a lower `DB_VERSION` because IndexedDB rejects `indexedDB.open(name, version)` with `VersionError` on downgrade. Follow additive expand-and-contract migrations and ship `DB_VERSION = N + 1` (e.g. `3`) that safely repairs/migrates from `oldVersion === 2`. Catch `VersionError` defensively in `src/storage/indexeddb.ts` to show a non-destructive update-required banner — **never** call `indexedDB.deleteDatabase()`.
- **Native / Capacitor (Apple App Store & Google Play — Phase 6) Roll-Forward Strategy:**
  - True binary rollback does not exist on iOS or Android once devices install an update. Both stores require **Phased / Staged Rollout + Pause/Halt + Monotonic Roll-Forward Hotfix**:
    - **Apple App Store:** Ship via 7-day **Phased Release** (`1% → 2% → 5% → 10% → 20% → 50% → 100%`). On regression, **Pause** immediately (up to 30 cumulative days, unlimited pauses), fix on a hotfix branch, increment SemVer + `CFBundleVersion`, and submit a roll-forward hotfix (using **Expedited Review** if critical).
    - **Google Play Store:** Ship via **Staged Rollout** (e.g. `5% → 20% → 50% → 100%`). On regression, **Halt rollout** immediately (stops new installs/updates; already-updated devices stay on the bad `versionCode`), fix on a hotfix branch, increment `versionCode` + `versionName`, and publish a roll-forward hotfix.
  - **Zero-SDK Release Health Monitoring:** Rely strictly on OS-level **App Store Connect Crashes/Metrics** and **Google Play Android Vitals** (plus GitHub Issues / store reviews), preserving Pillar 2's "Data Not Collected" privacy posture with zero in-app crash or analytics SDKs.

---

## 5-Pillar Cross-Reference Matrix

| Core Engineering Pillar | Key Guarantees & Technical Guardrails | Plan Specification Links | Enforced in Build Phase(s) |
| ----------------------- | ------------------------------------- | ------------------------ | -------------------------- |
| **1. Security (Utmost Importance)** | • Strict W3C CSP3 `<meta http-equiv="Content-Security-Policy">` (`connect-src 'none'`, `default-src 'self'`, Trusted Types `require-trusted-types-for 'script'`, no `frame-ancestors` warning), `<meta name="referrer" content="no-referrer">`, 3-line `top !== self` frame-buster, and Vite-generated `sw.js` same-origin + `pr-*` bypass guard<br>• Base-path origin-isolated IndexedDB & CacheStorage naming (`simple-budget-app` vs. `simple-budget-app-pr-<N>`, OQ-1)<br>• Strict ban on `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval` across `src/`<br>• 10 MB-bounded, prototype-pollution-safe (`__proto__`, `constructor`, `prototype` rejected) `validateBackupPayload` + pre-import snapshot/confirm + Phase 6 encrypted backup envelope (`PBKDF2` + `AES-256-GCM`) & biometric app lock<br>• Single-transaction atomic IndexedDB `replaceAll` rollback on import failure + non-destructive `VersionError` handling (no `deleteDatabase()`)<br>• Root web `dependencies: {}`, `.npmrc` `save-exact=true`, `pnpm-workspace.yaml` (`onlyBuiltDependencies`, `minimumReleaseAge`), `pnpm audit --audit-level=high`, full-40-char SHA-pinned CI actions, Dependabot, CodeQL, `dependency-review`, `native/capacitor.config.ts` `allowNavigation: []` + `WKAppBoundDomains` | • [frontend.md → Security & Privacy Guardrails](frontend.md#security--privacy-guardrails)<br>• [frontend.md → Shared-Origin Isolation](frontend.md#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default)<br>• [data-model.md → Versioned `BudgetBackup` Schema & Hardened Import Validation](data-model.md#versioned-budgetbackup-schema--hardened-import-validation)<br>• [data-model.md → Post-MVP Encrypted Backup Envelope](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)<br>• [storage.md → Atomic Backup Restoration (`replaceAll`)](storage.md#atomic-backup-restoration-replaceall)<br>• [storage.md → Security properties](storage.md#security-properties)<br>• [dependency-strategy.md → Guardrails](dependency-strategy.md#guardrails-enforce-in-ci--review)<br>• [portability.md → Capacitor WebView Runtime Hardening](portability.md#4-capacitor-webview-runtime-hardening-nativecapacitorconfigts) | **Phase 1** (CSP, Trusted Types, SHA pins, Dependabot, CodeQL, lockfile)<br>**Phase 2** (`validateBackupPayload`)<br>**Phase 3** (base-path `DB_NAME`, atomic `replaceAll`, `VersionError` safety)<br>**Phase 4A–4C** (safe DOM APIs, DOM XSS & pre-import safety E2E)<br>**Phase 4D** (Vite-generated `sw.js` guard, preview DB isolation E2E)<br>**Phase 5** (full regression & SHA-pinned `release.yml`)<br>**Phase 6** (`native/` WebView, encrypted backup & biometric lock) |
| **2. App Store & Play Store "Data Not Collected" Privacy** | • Legitimate Apple App Store Connect **"Data Not Collected"** & Google Play Console **"No data shared / No data collected"** declarations<br>• 100% on-device storage, zero analytics/telemetry/crash SDKs (OS-level App Store Connect Crashes & Android Vitals only), zero remote fonts/CDNs/icons; CSV/OFX/QFX file import preserves the label while bank-sync aggregators explicitly re-open Pillar 2<br>• iOS `Info.plist` (`ITSAppUsesNonExemptEncryption=false`) + `PrivacyInfo.xcprivacy` derived from Xcode Privacy Report (preventing `ITMS-91053`)<br>• Android `allowBackup="false"` + `dataExtractionRules` excluding `cloud-backup` & `device-transfer` (OQ-3), `AD_ID` stripped<br>• Store Submission Checklist (privacy policy URL, Guideline 4.2, Financial features, Data safety) & Playwright `context.on("request")` zero-egress gate | • [portability.md → App Store & Play Store Privacy Compliance ("Data Not Collected")](portability.md#app-store--play-store-privacy-compliance-data-not-collected)<br>• [portability.md → iOS `PrivacyInfo.xcprivacy`](portability.md#2-ios-required-reason-api-privacy-manifest-nativeiosappappprivacyinfoxcprivacy)<br>• [portability.md → Google Play Console Data Safety](portability.md#3-google-play-console--data-safety-backup-exclusion--manifest-hygiene)<br>• [portability.md → Store Submission Checklist](portability.md#store-submission-checklist-phase-6)<br>• [data-model.md → Privacy-Label Impact and Sync Tradeoffs](data-model.md#privacy-label-impact-and-sync-tradeoffs)<br>• [frontend.md → Zero Remote Fonts, CDNs, or Icon Requests](frontend.md#3-zero-remote-fonts-cdns-or-icon-requests)<br>• [testing.md → Mandatory Playwright E2E Security, Privacy & Viewport Scenarios](testing.md#4-mandatory-playwright-e2e-security-privacy--viewport-scenarios-e2espects) | **Phase 1** (`connect-src 'none'`, zero external URLs in `dist/`)<br>**Phase 4A–4D** (self-hosted assets + Playwright `context.on("request")` zero-egress E2E gate on every UI slice)<br>**Phase 5** (full zero-egress regression audit)<br>**Phase 6** (backup flags, Privacy Report, store checklist, zero-SDK vitals) |
| **3. Build & Testing Best Practices** | • Strict `tsconfig.json` compiler flags (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, etc.), `.nvmrc` + `node-version-file`, exact versions decided at bootstrap, `.github/dependabot.yml`, and full-SHA-pinned CI actions<br>• `>= 95%` line & branch coverage gate on `src/core/` via `@vitest/coverage-v8` (colocated `src/**/*.test.ts`)<br>• `fake-indexeddb` integration & atomic rollback test suite (incl. in-memory active/paused rule filtering)<br>• Playwright E2E across Chromium + WebKit & 3 viewports (`375×667`, `829×1194`, `390×844`) against `vite preview` + `@axe-core/playwright` WCAG 2.2 AA scans, co-shipped with every UI slice (`C12`)<br>• Mode-(a) sub-path PR preview (`/simple-budget-app/pr-<PR#>/`) via `gh-pages` branch publishing (OQ-5) with `concurrency: { group: "pages-deploy", cancel-in-progress: false }`, `.github/workflows/release.yml` SemVer release/changelog automation + `workflow_dispatch` rollback, and `vars.NATIVE_BUILDS_ENABLED == 'true'` native gating | • [dependency-strategy.md → Strict TypeScript Compiler Flags](dependency-strategy.md#strict-typescript-compiler-flags-tsconfigjson)<br>• [dependency-strategy.md → CI actions (the allowed set)](dependency-strategy.md#ci-actions-the-allowed-set)<br>• [testing.md → The Test Pyramid](testing.md#the-test-pyramid-who-does-what--when)<br>• [testing.md → Coverage Threshold & Mandatory Security / Edge-Case Test Matrix](testing.md#coverage-threshold--mandatory-security--edge-case-test-matrix)<br>• [testing.md → CI workflow mechanics (`gh-pages`)](testing.md#ci-workflow-mechanics-gh-pages-branch-publishing--prune-on-merge--production-unchanged)<br>• [testing.md → GitHub Pages Mode-(a) Concurrency & Site-Tree Preservation](testing.md#github-pages-mode-a-concurrency--site-tree-preservation-githubworkflowsdeploy-pagesyml)<br>• [testing.md → Headless / CLI Execution Rule](testing.md#headless--cli-execution-rule-no-hanging-dev-servers) | **Phase 1** (CI bootstrap, `.nvmrc`, Dependabot, SHA pins, strict TS, Vitest/Playwright config, SemVer `0.1.0`)<br>**Phase 2** (`>= 95%` core unit coverage)<br>**Phase 3** (`fake-indexeddb` integration tests)<br>**Phase 4A** (smoke E2E, axe a11y + `deploy-pages.yml`)<br>**Phase 4B–4D** (co-shipped vertical-slice & offline/SW E2E)<br>**Phase 5** (full regression audit, `release.yml`, rollback verification, native CI scaffolding)<br>**Phase 6** (native CI & phased store releases) |
| **4. Modern Zero-Prod-Dep Tech Stack** | • Single cross-platform static bundle (`vite build` → `dist/`) with root `dependencies: {}` & zero `@capacitor/*` in `src/`; `native/` workspace package + `PlatformServices` runtime seam; custom in-repo Vite SW plugin (`updateViaCache: "none"`, no Workbox)<br>• Integer-cent money (`amountCents`) + `Intl.NumberFormat` / `Intl.DateTimeFormat`<br>• Short-month `Date.UTC` clamping (`daysInMonth`, fixed `12:00:00Z` due instant, OQ-2) + `rule.lastPostPeriod` deletion tombstone alignment<br>• Honest storage durability (first-action `persist()`, `persisted()` status & N-day backup nag in Settings + OQ-4 durable native store release gate)<br>• WCAG 2.2 AA accessibility (`<dialog>`, `role="tablist"`, `aria-live="polite"`, `44×44 CSS px` targets) + `BroadcastChannel` multi-tab sync | • [dependency-strategy.md → Zero production dependencies](dependency-strategy.md#zero-production-dependencies)<br>• [portability.md → Package boundary & `PlatformServices` seam](portability.md#package-boundary--platformservices-seam)<br>• [frontend.md → Service Worker Design](frontend.md#service-worker-design-pwa-offline-scoping--update-lifecycle)<br>• [recurring-engine.md → Short-Month `Date.UTC` Clamping](recurring-engine.md#short-month-dateutc-clamping)<br>• [activity-model.md → Editing any activity](activity-model.md#editing-any-activity)<br>• [storage.md → Storage Durability & WebKit Eviction Mitigation](storage.md#storage-durability--webkit-eviction-mitigation)<br>• [frontend.md → Accessibility (WCAG 2.2 AA) & Multi-Tab State Synchronization](frontend.md#accessibility-wcag-22-aa--multi-tab-state-synchronization) | **Phase 1** (Vite/TS/Biome stack)<br>**Phase 2** (short-month clamping, `12:00:00Z` due instant, integer cents)<br>**Phase 3** (first-action `persist()`, `persisted()` + `lastBackupAt`)<br>**Phase 4A–4C** (`PlatformServices` seam, WCAG 2.2 AA, iPhone-Duo CSS, `Intl`, `BroadcastChannel`)<br>**Phase 4D** (custom Vite SW plugin with `updateViaCache: "none"`)<br>**Phase 6** (`native/` workspace, `PlatformServices`, durable native store) |
| **5. Post-MVP Extensibility** | • IndexedDB `DB_VERSION = 1` sequential `onupgradeneeded` migration switch + `"meta"` store + forward-only expand-and-contract migration discipline<br>• Secondary indexes (`by_dateTime`, `by_type`, `by_tags` multiEntry, compound `by_rule_period`; no boolean index) + reserved `deletedAt?`/`deviceId?` tombstones for future E2EE sync<br>• Passphrase-encrypted backup envelope (`PBKDF2-HMAC-SHA256` `600_000..5_000_000` iterations + `AES-256-GCM`) & biometric app lock (Phase 6 store gate)<br>• Non-breaking extension seams for: (1) Category Budgets/Envelopes (`BudgetTarget`), (2) Multi-Period Trends (`summarizeByPeriod`), (3) Flexible Cadences (`weekly`/`bi-weekly`/`yearly`), (4) Split Transactions (`splits`), (5) Multi-Account & Transfers (`Account` + `transferPeerId`), (6) First-class CSV/OFX/QFX file import (`importBatchId`, `externalTxnId`), opt-in SimpleFIN Bridge, and bank-sync aggregators (separate project re-opening Pillar 2), (7) Multi-Currency, (8) E2EE Multi-Device Sync | • [storage.md → IndexedDB Schema Versioning, Indexes & Migration Strategy](storage.md#indexeddb-schema-versioning-indexes--migration-strategy)<br>• [data-model.md → Post-MVP Encrypted Backup Envelope](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)<br>• [data-model.md → Post-MVP Extensibility & Growth Seams](data-model.md#post-mvp-extensibility--growth-seams)<br>• [data-model.md → Privacy-Label Impact and Sync Tradeoffs](data-model.md#privacy-label-impact-and-sync-tradeoffs)<br>• [activity-model.md → Post-MVP Analytics & Category Target Composition](activity-model.md#3-post-mvp-analytics--category-target-composition)<br>• [portability.md → The public API](portability.md#the-public-api-what-the-front-end-calls) | **Phase 2** (extensible `types.ts` + `BudgetBackup` `schemaVersion: 1`)<br>**Phase 3** (`DB_VERSION = 1` migration switch, `VersionError` safety + secondary indexes)<br>**Phase 5** (SemVer tagging & roll-forward readiness)<br>**Phase 6** (encrypted backup envelope, biometric app lock & phased mobile releases) |

---

## Adopted Review Defaults (Story #164 — OQ-1..OQ-5)

The independent third-model review (Story #164 / Spike #165) resolved five open design questions with explicit defaults so implementation is never blocked (extended by Story #192 / Spike #199's release-tagging default: manual SemVer in `package.json` + annotated `vX.Y.Z` git tags on `main` triggering `.github/workflows/release.yml`):

| ID | Question | Adopted Default | Status / Notes |
| -- | -------- | --------------- | -------------- |
| **OQ-1** | Origin isolation on GitHub Pages (`tandyn.github.io`) | Derive IndexedDB (`DB_NAME`), CacheStorage, and `BroadcastChannel` names from `import.meta.env.BASE_URL` (`simple-budget-app` / `sbapp-<buildhash>` / `simple-budget-sync` vs. `simple-budget-app-pr-<N>` / `sbapp-pr-<N>-<buildhash>` / `simple-budget-sync-pr-<N>`) and document the shared-origin residual risk. A custom domain for the production PWA is optional (recommended for full origin isolation). | Adopted by default ([frontend.md](frontend.md#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default)) |
| **OQ-2** | Recurring due instant vs. timezone drift | Fixed `12:00:00Z` due instant (correct local calendar day for UTC−12..UTC+11) with period rollups using `Activity.period` for `source === "recurring"` and documented UTC+12..+14 residual (instead of passing an IANA zone into the engine). | Adopted by default ([recurring-engine.md](recurring-engine.md#short-month-dateutc-clamping)) |
| **OQ-3** | Android Auto Backup posture | Exclude all (`android:allowBackup="false"`, `android:fullBackupContent="false"`, `dataExtractionRules` excluding `cloud-backup` and `device-transfer`). | Adopted by default ([portability.md](portability.md#3-google-play-console--data-safety-backup-exclusion--manifest-hygiene)) |
| **OQ-4** | Durable native store before first store release | Required Phase 6 release gate before first App Store / Play Store submission (SQLite `StorageAdapter` or mirrored auto-snapshot to native app Documents). | Adopted by default ([storage.md](storage.md#storage-durability--webkit-eviction-mitigation)) |
| **OQ-5** | GitHub Pages PR-preview publishing mechanism | Switch from `actions/deploy-pages` to plain `git` publishing on the `gh-pages` branch using `GITHUB_TOKEN` (Pages source = "Deploy from a branch" → `gh-pages`), preserving all mode-(a) guarantees (production root untouched, PR sub-path pruned on merge/close, zero third-party Pages actions). | **Adopted by default — flagged to the user for explicit confirmation** before Phase 4A deployment is enabled ([testing.md](testing.md#ci-workflow-mechanics-gh-pages-branch-publishing--prune-on-merge--production-unchanged)) |
