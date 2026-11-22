# The budget app

The **product** this repository builds: a simple budget app. Unlike the
orchestration system (which already exists and is documented in
[orchestration.md](orchestration.md)), the app is **built over time** by the
pipeline. This doc tracks what is real **now** and grows as each story ships.

Keep it split by area so a reviewer can read only what they need:

| Area | What it covers | Doc |
| ---- | -------------- | --- |
| **backend** | APIs, business logic, validation, persistence (integer-cent money, short-month `Date.UTC` clamping + `12:00:00Z` due instant, `BudgetBackup` validation + encrypted backup envelope, insights/search, file import & E2EE tombstone seams) | [budget-app/backend.md](budget-app/backend.md) |
| **frontend** | UI, components, state, platform seam (zero-prod-dep static bundle, strict CSP `connect-src 'none'` + Trusted Types, `assertNotFramed` guard & `bootstrapApp` in `src/main.ts`, safe-DOM helpers `src/ui/dom.ts`, WCAG 2.2 AA 3-tab accessible shell + native `<dialog>` helper `src/ui/shell.ts`, `Intl`/input formatters `src/ui/format.ts`, Budget tab UI `src/ui/budgetTab.ts` + `src/styles/budget.css`, collapsible Recurring Rules panel `src/ui/recurringRules.ts`, Insights tab UI `src/ui/insightsTab.ts` + `src/styles/insights.css`, Settings tab UI `src/ui/settingsTab.ts` + `src/styles/settings.css`, iPhone-Duo dual-state CSS frame `src/styles/frame.css`, `PlatformServices` runtime seam `src/platform/services.ts`, base-path-scoped `BroadcastChannel` sync `src/platform/sync.ts`; **PWA-scoped** manifest & SW deferred to Phase 4D) | [budget-app/frontend.md](budget-app/frontend.md) |
| **data** | the budget data model, IndexedDB `DB_VERSION = 1` schema & indexes (base-path `DB_NAME`, no boolean index), atomic `replaceAll` restore, honest storage durability (v1 shipped in [budget-app/backend.md](budget-app/backend.md)); OQ-4 durable native store gate & post-MVP extension seams | [budget-app/backend.md](budget-app/backend.md) / [the app plan](#the-app-plan) |
| **testing** | test pyramid (Vitest `>= 95%` core coverage via `@vitest/coverage-v8`, `fake-indexeddb`, `happy-dom`, Playwright 3-viewport Chromium + WebKit E2E + `@axe-core/playwright` WCAG 2.2 AA scans + zero-egress gate), Phase 1 toolchain conventions, CI pipeline (SHA-pinned actions, `.nvmrc`, Dependabot, CodeQL), post-merge repo hardening, headless CLI verification rules, `gh-pages` mode-(a) PR preview (`.github/workflows/deploy-pages.yml`), SemVer release automation & rollback/roll-forward, credential-gated native builds | [budget-app/testing.md](budget-app/testing.md) |

## The app plan

The navigable, agent-consumable design-of-record for the whole app lives at the repo root under
[`project-plan/`](../project-plan/README.md) — a per-area set of docs covering
the data model, local secure storage, the recurring-transaction engine, the
activity model (integer-cent money, insights/search surface, file import &
extensibility seams), the **frontend / UI** surface (a zero-prod-dep **static
bundle**, strict CSP `connect-src 'none'` + Trusted Types & DOM XSS ban, origin
isolation, custom Vite SW plugin, the **iPhone-Duo foldable viewport** — folded
= baseline 1-page / unfolded = enhanced 1-page, slab phones ≈ folded — and a
**configurable base path**), platform portability (one bundle, three webview
targets, `native/` workspace boundary + `PlatformServices` seam, **cross-platform
static artifact**, and Apple App Store / Google Play Store **"Data Not
Collected"** privacy compliance + Store Submission Checklist), the dependency
strategy (zero production deps in the web bundle + the **well-maintained dev-dep
& SHA-pinned CI-action set** + `.nvmrc`, `pnpm-workspace.yaml`, Dependabot,
CodeQL, and strict TypeScript compiler flags), the testing & CI/CD strategy
(unit/integration/E2E, `@axe-core/playwright` a11y, **mode-(a) `gh-pages` branch
PR preview** with production-untouched + prune-on-merge, SemVer release
automation & rollback/roll-forward, **credential-gated**
native builds), and the **iterative 5-phase PWA MVP (Phases 1–3, 4A–4D, 5) +
Phase 6 native shell & store submission build order**
([project-plan/build-order.md](../project-plan/build-order.md)).

| Area | Doc |
| ---- | --- |
| Index / MVP scope | [project-plan/README.md](../project-plan/README.md) |
| Data model (`RecurringRule`, `Activity`, `BudgetBackup`, encrypted backup envelope, post-MVP seams) | [project-plan/data-model.md](../project-plan/data-model.md) |
| Local secure storage (`DB_VERSION = 1`, base-path `DB_NAME`, indexes, atomic `replaceAll`, honest durability & OQ-4 native store gate) | [project-plan/storage.md](../project-plan/storage.md) |
| Recurring engine (idempotent auto-posting, short-month `Date.UTC` clamping, `12:00:00Z` due instant) | [project-plan/recurring-engine.md](../project-plan/recurring-engine.md) |
| Activity model (integer-cent money, insights/search) | [project-plan/activity-model.md](../project-plan/activity-model.md) |
| Frontend / UI (zero-prod-dep static bundle, strict CSP + Trusted Types & safe DOM, origin isolation, custom Vite SW plugin, iPhone-Duo foldable viewport, configurable base path) | [project-plan/frontend.md](../project-plan/frontend.md) |
| Portability (one bundle / three webview targets, `native/` package boundary + `PlatformServices` seam, App Store & Play Store privacy & Store Submission Checklist) | [project-plan/portability.md](../project-plan/portability.md) |
| Dependency strategy (zero prod deps in web bundle + isolated `native/` shell + well-maintained dev-dep & SHA-pinned CI-action set + `.nvmrc`, `pnpm-workspace.yaml`, Dependabot, CodeQL, strict `tsconfig.json`) | [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md) |
| Testing & CI/CD (test pyramid, `>= 95%` core coverage, `@axe-core/playwright` a11y, zero-egress E2E gate, `gh-pages` mode-(a) PR preview, SemVer release automation & rollback/roll-forward, credential-gated native builds) | [project-plan/testing.md](../project-plan/testing.md) |
| MVP execution & build order (iterative 5-phase PWA MVP [Phases 1–3, 4A–4D, 5] + Phase 6 native shell & phased store release + release/rollback matrix + 5-pillar matrix + OQ-1..OQ-5 defaults) | [project-plan/build-order.md](../project-plan/build-order.md) |

> The plan is the design-of-record. When an area *ships*, the
> `budget-app/<area>.md` area doc above will track what is real in code; the
> plan stays as the design-of-record.

When an area ships, add a `budget-app/<area>.md` with the details and link it
here; add its key terms to the [glossary](glossary.md). Do **not** inline a whole
area's detail into this file — keep it a short map.

## Key decisions

- **Execution Order (Iterative 5-Phase PWA MVP [Phases 1–3, 4A–4D, 5] + Phase 6 Native Shell & Store Submission, [project-plan/build-order.md](../project-plan/build-order.md)):**
  1. **Phase 1 — Toolchain, Security/CSP Baseline & CI Gate Bootstrap:** `package.json` (`dependencies: {}`, `engines`, `packageManager`), `.nvmrc`, `.npmrc` (`save-exact=true`), `pnpm-workspace.yaml` (`saveExact: true`, `allowBuilds: {}`, `minimumReleaseAge: 4320`), strict `tsconfig.json` + `tsconfig.node.json`, Biome v2, Vite (`VITE_BASE_PATH`), Vitest (`@vitest/coverage-v8`), Playwright (`@axe-core/playwright`), `index.html` (`<meta http-equiv="Content-Security-Policy">` with `connect-src 'none'` + Trusted Types `require-trusted-types-for 'script'; trusted-types sw-register`, `<meta name="referrer" content="no-referrer">`), `src/env.d.ts` (ambient `Window.trustedTypes`), `src/main.ts` (`assertNotFramed` `top !== self` frame-buster) + `src/main.test.ts`, `scripts/verify-build-gates.mjs` (`verify:gates`) + `scripts/verify-build-gates.test.mjs`, `.github/dependabot.yml`, and `.github/workflows/ci.yml` (full-SHA-pinned actions, CodeQL, `dependency-review`) + `main` branch protection before any feature code.
  2. **Phase 2 — Pure Core Domain, Validation, Recurring Engine & Insights (`src/core/`):** Pure TypeScript types (incl. reserved `importBatchId`, `deletedAt?`, `deviceId?`), integer-cent & 10 MB prototype-pollution-safe `validateBackupPayload`, recurring `missingPeriods` with short-month `daysInMonth` clamping + `12:00:00Z` due instant (OQ-2), `computeAvailableFunds`, and `searchActivities`/`summarizeByTag` (using `Activity.period` for recurring rollups) with `>= 95%` line/branch unit test coverage.
  3. **Phase 3 — IndexedDB Storage Layer (`DB_VERSION = 1` + Indexes + Atomic Restore) & Public `BudgetApi` (`src/storage/`, `src/budgetApi.ts`):** `StorageAdapter` with single-transaction atomic `replaceAll` and `getMeta`/`setMeta`, `IndexedDbAdapter` (base-path `DB_NAME` (OQ-1), `"meta"`, `"rules"`, `"activities"` stores and secondary indexes with no boolean index, defensive non-destructive `VersionError` handling with `deleteDatabase()` forbidden, first-action `navigator.storage?.persist?.()` + `persisted()` status), `createBudgetApi` (`exportBackup` / `importBackup` / `getLastBackupAt`), and `fake-indexeddb` integration/rollback tests.
  4. **Phase 4A — Walking Skeleton: App Shell, `PlatformServices` Seam, Smoke Playwright E2E & Mode-(a) `gh-pages` Deploy (`src/ui/`, `src/platform/`, `src/styles/`, `e2e/`, `.github/workflows/deploy-pages.yml`):** Safe DOM construction (`src/ui/dom.ts`, zero `innerHTML`), `src/platform/services.ts` (`PlatformServices` web/PWA seam + `window.Capacitor` feature detection + ambient types in `src/env.d.ts`), WCAG 2.2 AA 3-tab shell (`src/ui/shell.ts`: `<nav role="tablist">`, `<dialog class="confirm-dialog">`, `>= 44×44 CSS px` targets, mounted in `src/main.ts`), `src/styles/frame.css` (`375×667` folded / `829×1194` unfolded split-pane at `>= 700px` / `390×844` slab CSS), Chromium + WebKit smoke/zero-egress/`@axe-core/playwright` E2E harness (`e2e/fixtures/index.ts`, `e2e/smoke.spec.ts`), and serialized mode-(a) `gh-pages` branch PR previews + production deploy (OQ-5).
  5. **Phase 4B — Vertical Slice 1: Budget Tab + Co-Shipped Playwright E2E (`src/ui/`, `e2e/`):** Available Funds header (`aria-live="polite"`), quick-add expense/deposit/income form, activity edit/backdate/delete/tagging `<dialog>`, recurring rules drawer, `Intl` formatting, and co-shipped Budget + DOM XSS immunity E2E specs.
  6. **Phase 4C — Vertical Slice 2: Insights & Settings Tabs + Co-Shipped Playwright E2E (`src/ui/`, `e2e/`):** Insights `searchActivities`/`summarizeByTag` filtering, Settings `persisted()` status + backup-age nag + pre-import `File.size`/confirm/safety-snapshot guard via `PlatformServices`, base-path-scoped `BroadcastChannel` multi-tab sync, and co-shipped Insights/Settings/backup/multi-tab E2E specs.
  7. **Phase 4D — Offline PWA: Manifest, Custom Vite SW Plugin (`updateViaCache: "none"`) & SW/Isolation E2E (`public/`, Vite SW plugin, `e2e/`):** Manifest-relative `public/manifest.webmanifest`, custom Vite plugin emitting `dist/sw.js` (same-origin guard, `pr-*` bypass, `{ updateViaCache: "none" }`, user-accepted update banner, skipped in Capacitor), and co-shipped offline reload + preview DB-name isolation E2E specs.
  8. **Phase 5 — MVP Release Hardening, Versioning/Tagging/Changelog Automation, Rollback/Roll-Forward Verification & Native CI Scaffolding (`.github/workflows/release.yml`, `deploy-pages.yml`, `ci.yml`, `e2e/`):** Full cross-journey Chromium + WebKit 3-viewport E2E regression & zero-egress/a11y audit, `.github/workflows/release.yml` (manual SemVer in `package.json` + annotated `vX.Y.Z` tags → immutable `dist/` archive + Conventional Commits GitHub Release), `deploy-pages.yml` `workflow_dispatch` tag re-deploy for same-schema PWA rollback + Emergency No-Op/Kill-Switch SW roll-forward & `VersionError` forward-only readiness, and `vars.NATIVE_BUILDS_ENABLED == 'true'` skip-not-fail native build scaffolding in `.github/workflows/ci.yml`.
  9. **Phase 6 — Native Shell Packaging (`native/` Workspace), Store Compliance & Phased Mobile Releases (Post-MVP):** Isolated `native/` workspace package (`native/package.json`, `native/capacitor.config.ts` with `webDir: "../dist"`, `WKAppBoundDomains`), native `window.Capacitor.Plugins` bridge wiring & on-device verification behind `PlatformServices` (zero `@capacitor/*` in `src/`), OQ-4 durable native store behind `StorageAdapter`, passphrase-encrypted backup envelope (`PBKDF2` + `AES-256-GCM`) & biometric app lock, Android `allowBackup="false"` + `dataExtractionRules` (OQ-3), iOS `ITSAppUsesNonExemptEncryption=false` + Xcode Privacy Report-derived `PrivacyInfo.xcprivacy`, monotonic native versioning (`CFBundleVersion` / `versionCode`) with Apple 7-day Phased Release & Google Play Staged Rollout + roll-forward hotfixes, and Store Submission Checklist.
- **5-Pillar Security, Privacy & Extensibility Guarantees:**
  - **Pillar 1 (Security):** Strict W3C CSP3 `<meta>` (`connect-src 'none'` + Trusted Types), `<meta name="referrer" content="no-referrer">`, frame-buster, base-path origin isolation (OQ-1), zero `innerHTML` / unsafe DOM sinks, 10 MB prototype-pollution-safe `BudgetBackup` validation, single-transaction atomic IndexedDB `replaceAll` restore, SHA-pinned CI actions, Dependabot, CodeQL, `.npmrc` `save-exact=true` + `pnpm-workspace.yaml` cooldown + `pnpm audit --audit-level=high`.
  - **Pillar 2 (Store Privacy):** 100% on-device storage and zero network egress qualify for Apple App Store Connect **"Data Not Collected"** and Google Play Console **"No data shared / No data collected"** (CSV/OFX/QFX file import preserves this; bank-sync aggregators re-open Pillar 2), backed by iOS `ITSAppUsesNonExemptEncryption=false` + Xcode Privacy Report-derived `PrivacyInfo.xcprivacy`, Android `allowBackup="false"` + `dataExtractionRules` + `AD_ID` removal, Store Submission Checklist, and automated Playwright zero-egress verification.
  - **Pillars 3–5 (Build/Test, Modern Tech Stack, Post-MVP Extensibility):** Strict TypeScript flags, `.nvmrc`, `>= 95%` `src/core/` coverage, `@axe-core/playwright` WCAG 2.2 AA scans, short-month `Date.UTC` clamping + `12:00:00Z` due instant, honest storage durability + OQ-4 durable native store gate, `DB_VERSION = 1` schema migration switch, encrypted backup envelope (`PBKDF2` + `AES-256-GCM`), `deletedAt?`/`deviceId?` tombstones for E2EE sync, and non-breaking seams for category envelopes, multi-period analytics, flexible cadences, split transactions, multi-account transfers, and file import / opt-in bank sync.
- **Adopted Review Defaults (Story #164 — OQ-1..OQ-5, [project-plan/build-order.md](../project-plan/build-order.md#adopted-review-defaults-story-164--oq-1oq-5)):**
  - **OQ-1:** Namespace IndexedDB/CacheStorage/`BroadcastChannel` by `BASE_URL` and document shared-origin residual risk (custom domain optional).
  - **OQ-2:** Fixed `12:00:00Z` recurring due instant + `Activity.period` rollups.
  - **OQ-3:** Android `allowBackup="false"` + `dataExtractionRules` excluding cloud-backup and device-transfer.
  - **OQ-4:** Durable native store is a required Phase 6 gate before first store submission.
  - **OQ-5 (user confirmed, implemented in `.github/workflows/deploy-pages.yml` #278):** Publish GitHub Pages production + PR previews via plain `git` to the `gh-pages` branch using `GITHUB_TOKEN` (mode-(a) guarantees preserved, zero third-party Pages actions).
  - **Release tagging default (Story #192 / Spike #199):** Maintain SemVer manually in root `package.json` and push annotated `vX.Y.Z` tags on `main` to trigger `.github/workflows/release.yml` (SHA-pinned first-party actions, zero extra third-party release bots).

## Conventions

- A **software-engineer** updating an area should keep the matching
  `budget-app/<area>.md` accurate and add new glossary terms.
- The **docs-agent** reconciles everything here against the code before the
  feature PR merges to `main`.
