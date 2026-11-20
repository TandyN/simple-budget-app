# Budget App Plan

This is the **full plan** for the simple budget app. It is a navigable,
agent-consumable set of documents: this file is the index, and each of the
nine per-area docs is a self-contained hub you can read on its own.

Grounded in the user's ask (Story #5), the solutions-architect's design
findings (signed comment on spike #6), extended by **Story #21** to add
**Android** as a first-class platform and a codified **dependency strategy**
(spike #22), completed by **Story #115** to add the **frontend/PWA plan**,
the **insights/search surface**, **integer-cent money**, and **bank-OAuth
slots**, refined by **Story #131** to lock in the **well-maintained
dev-dep criterion**, the **mode (a) same-site sub-path PR preview**
(production-untouched + prune-on-merge), the **zero-prod-dep, cross-platform
static bundle**, and the **iPhone-Duo foldable viewport** as the primary
target, audited by **Story #153** (spike #154) against the **5 core
engineering pillars** (security, App Store & Play Store "Data Not Collected"
privacy compliance, build/test best practices, modern zero-prod-dep tech
stack, and post-MVP extensibility), and independently reviewed in **Story #164**
(spike #165) to harden CI/supply-chain hygiene (SHA-pinned actions, `.nvmrc`,
`pnpm-workspace.yaml`, Dependabot, CodeQL), switch Pages PR previews to
`gh-pages` branch publishing (OQ-5, flagged to the user for confirmation),
add origin isolation, Trusted Types, and a Vite-generated Service Worker,
fix storage/data-model correctness gaps, specify **Phase 6** (native shell
packaging & store submission), rewrite post-MVP extensibility seams, and
refined in **Story #192** (spike #199) to re-slice Phase 4 into iterative
story-sized vertical slices (**Phases 4A–4D** with co-shipped Playwright E2E),
refocus **Phase 5** on MVP release hardening, SemVer versioning/tagging/changelog
automation, and rollback/roll-forward readiness, and add a story-sizing map
([build-order.md](build-order.md)). **No code in this story** —
the deliverable is this plan. A software-engineer should be able to decompose
it into task tickets and start implementing.

## How to navigate

```
README.md  (you are here — what this is, MVP scope, links, out-of-scope)
    ├── storage.md              — where/how data is persisted locally, securely (IndexedDB DB_VERSION = 1, base-path DB_NAME, atomic replaceAll, honest storage durability & OQ-4 native store gate)
    ├── data-model.md           — entities, field definitions, types, BudgetBackup validation, encrypted backup envelope & post-MVP extensibility seams (file import, E2EE tombstones, bank-sync tradeoffs)
    ├── recurring-engine.md     — how recurring income/expense auto-posts (idempotent, short-month Date.UTC clamping, 12:00:00Z due instant OQ-2)
    ├── activity-model.md       — the unified, editable Activity record + insights/search
    ├── frontend.md             — the UI surface (zero-prod-dep static bundle, iPhone-Duo foldable viewport, configurable base path, origin isolation, custom Vite SW plugin, strict CSP + Trusted Types & DOM XSS ban)
    ├── portability.md          — one bundle / three webview targets, native/ package boundary + PlatformServices seam, App Store / Play Store privacy & Store Submission Checklist
    ├── dependency-strategy.md  — zero prod deps in web bundle (native/ isolated for Phase 6) + well-maintained dev-dep & SHA-pinned CI-action set + .nvmrc, pnpm-workspace.yaml, Dependabot, CodeQL & strict tsconfig
    ├── testing.md              — Testing & CI/CD strategy (unit, integration, E2E, >= 95% core coverage, @axe-core/playwright a11y, zero-egress E2E gate, gh-pages mode-(a) PR preview, credential-gated builds)
    └── build-order.md          — MVP Execution & Build Order (iterative Phases 1–3, 4A–4D, 5 PWA MVP + Phase 6 native shell & store submission, story-sizing map, release/rollback summary, 5-pillar matrix & adopted defaults OQ-1..OQ-5)
```

Read in this order for a first pass: **data-model → storage →
recurring-engine → activity-model → frontend → portability →
dependency-strategy → testing → build-order**. Each doc links to the others
where the boundary matters.

## MVP scope (what the app must support)

- **Monthly income + recurring expenses**, both defaulting to the **1st of every
  month**. (Bi-weekly / weekly cadence and custom dates are future work; short
  months clamp `dayOfMonth` 29–31 to the month's actual last day via `daysInMonth`
  so `Date.UTC` never overflows into the next month.)
- **Available Funds** = income − expenses, **derived** from the activity log
  (never stored as a separate number).
- The user can **add manual expenses and deposits** any time during the month.
- On each period boundary (MVP: the 1st) the system **auto-posts** each recurring
  income and recurring expense to the activity log — **without double-posting**.
- **Every activity is editable** after the fact (manual *and* auto-generated).
- **Manual tagging** on every activity (for insight / analytics).
- Every transaction **defaults to the current time but the timestamp is editable**.
- Recurring income and expenses can be **changed at any time** without losing
  prior auto-posted history.
- **Local and secure (Pillar 1 — defense-in-depth)**: data lives purely on the
  device with zero network egress, enforced by a strict W3C CSP3
  `<meta http-equiv="Content-Security-Policy">` (`connect-src 'none'`,
  `default-src 'self'`, Trusted Types `require-trusted-types-for 'script'; trusted-types sw-register`),
  `<meta name="referrer" content="no-referrer">`, a 3-line `top !== self`
  frame-buster in `src/main.ts` (since `script-src 'self'` blocks inline `<script>` in `index.html`), base-path origin-isolated IndexedDB,
  CacheStorage, and `BroadcastChannel` naming (OQ-1), a custom in-repo Vite plugin emitting `sw.js`
  with a same-origin guard, `pr-*` bypass, and user-accepted update banner, a
  strict ban on `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval`
  across `src/` (safe DOM APIs only), a 10 MB-bounded and
  prototype-pollution-safe (`__proto__`, `constructor`, `prototype` rejected)
  JSON backup validator (`validateBackupPayload`) with pre-import confirmation
  and safety snapshot, and single-transaction atomic IndexedDB backup
  restoration (`replaceAll`) that rolls back automatically on any failure so
  existing records are never clobbered. See
  [frontend.md → security & privacy guardrails](frontend.md#security--privacy-guardrails),
  [frontend.md → shared-origin isolation](frontend.md#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default),
  [data-model.md → BudgetBackup validation](data-model.md#versioned-budgetbackup-schema--hardened-import-validation),
  and [storage.md → atomic backup restoration](storage.md#atomic-backup-restoration-replaceall).
- **App Store & Play Store "Data Not Collected" privacy compliance & store submission (Pillar 2)**:
  100% on-device storage (IndexedDB for the MVP PWA, durable native store gate
  OQ-4 before store submission), zero third-party analytics/telemetry/crash
  SDKs, and zero remote fonts/CDNs/icons qualify the app for Apple App Store
  Connect **"Data Not Collected"** and Google Play Console **"No data shared / No
  data collected"** declarations, backed by iOS `ITSAppUsesNonExemptEncryption=false`,
  `native/ios/App/App/PrivacyInfo.xcprivacy` derived from Xcode's Privacy Report
  (preventing `ITMS-91053`), Android `allowBackup="false"` + `dataExtractionRules`
  excluding `cloud-backup` and `device-transfer` (OQ-3) + `AD_ID` removal,
  `native/capacitor.config.ts` WebView hardening (`allowNavigation: []`,
  `WKAppBoundDomains` pairing), a Store Submission Checklist (privacy policy URL,
  Guideline 4.2 mitigation, Play Financial features declaration, Data safety form,
  closed-test check), and an automated Playwright E2E `context.on("request")`
  zero-external-egress assertion. See
  [portability.md → App Store & Play Store privacy compliance](portability.md#app-store--play-store-privacy-compliance-data-not-collected),
  [portability.md → Store Submission Checklist](portability.md#store-submission-checklist-phase-6),
  and [testing.md → mandatory Playwright E2E scenarios](testing.md#4-mandatory-playwright-e2e-security-privacy--viewport-scenarios-e2espects).
- **Zero production dependencies (web bundle) & `native/` package boundary**:
  the root web bundle package (backend *and* frontend) uses only Web-platform
  APIs (IndexedDB, WebCrypto, `Date`/`Intl`, `crypto.randomUUID`, pure
  TS logic), keeps `package.json` `dependencies: {}`, and never imports
  `@capacitor/*`. Phase 6 Capacitor wrappers and native plugins live in an
  isolated `native/` workspace package (`native/package.json`), reached from the
  web bundle solely via runtime `window.Capacitor` detection in
  `PlatformServices` (`saveBackup`, `shareBackup`, `isNative`) — see
  [dependency-strategy.md](dependency-strategy.md) and
  [portability.md → Package boundary & `PlatformServices` seam](portability.md#package-boundary--platformservices-seam).
- **Cross-platform static bundle (one artifact, no per-platform build)**: the
  build output is a single **static web bundle** (`vite build` → `dist/`) with an
  **empty web-package `dependencies`**, and the **identical artifact** is served
  on **all phones** — the PWA (GitHub Pages) now and the iOS (WebKit) + Android
  (Chromium) Capacitor shells in `native/` later. There is **no per-platform
  bundle and no per-platform build flag** — cross-platform = the same web
  artifact on all devices, with native shell packaging isolated in `native/`. See
  [portability.md → what this buys](portability.md#what-this-buys) and
  [frontend.md → zero production dependencies](frontend.md#zero-production-dependencies-req-1).
- **Well-maintained dev-dep set & supply-chain hardening (Pillar 3)**: the
  **only** allowed dev dependencies are a small, curated toolchain (**pnpm** as
  package manager via `packageManager` + `pnpm/action-setup`, **Vite**,
  **Vitest**, **`@vitest/coverage-v8`**, **Playwright**,
  **`@axe-core/playwright`**, **`fake-indexeddb`**, **Biome**, **tsc**) **and
  the CI actions** the pipeline runs, each of which must pass the
  **well-maintained criterion** (Active & current · First-party /
  tool-maintainer · Industry-standard), with exact current majors decided at
  bootstrap, `.nvmrc` + `engines`, `.npmrc` `save-exact=true`,
  `pnpm-workspace.yaml` (`onlyBuiltDependencies`, `minimumReleaseAge`),
  `pnpm install --frozen-lockfile`, `pnpm audit --audit-level=high`, full
  40-character SHA-pinned CI actions, `.github/dependabot.yml` (`github-actions`
  + `npm`), CodeQL, `actions/dependency-review-action`, strict `tsconfig.json`
  compiler flags, and `>= 95%` line/branch coverage on `src/core/`. See
  [dependency-strategy.md → the well-maintained criterion](dependency-strategy.md#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)
  and [dependency-strategy.md → strict TypeScript compiler flags](dependency-strategy.md#strict-typescript-compiler-flags-tsconfigjson).
- **PR preview (mode a — same-site sub-path via `gh-pages` branch, OQ-5)**:
  every open PR targeting `main` gets a preview at
  `tandyn.github.io/simple-budget-app/pr-<PR#>/` — a **sub-path** of the same
  production site, built with a **configurable base path**
  (`VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/`) and published via plain `git`
  to the `gh-pages` branch using `GITHUB_TOKEN` (no third-party Pages action;
  serialized with `concurrency: { group: "pages-deploy", cancel-in-progress: false }`).
  **Two guarantees:** the **production root is untouched** on a PR deploy (only
  `pr-<PR#>/` is written), and the **PR sub-path is pruned on merge/close**.
  **OQ-5 is adopted by default and flagged to the user for explicit
  confirmation** before Phase 4A deployment is enabled. See
  [testing.md → CI deploy & preview](testing.md#ci-deploy--preview-github-pages)
  and [frontend.md → base path](frontend.md#base-path-configurable-explicit-build-decision).
- **Responsive viewport target — iPhone-Duo foldable (dual-state)**: the
  **primary** viewport target is the **iPhone-Duo** foldable — **folded** = the
  baseline **1-page** experience (`375×667`, slab-like, every tab fits on one
  panel, no scroll); **unfolded** = the **enhanced 1-page** view (`829×1194`,
  dual-panel, split-pane). **Slab phones (`390×844`, ≈ folded) are the secondary
  target.** This **supersedes** the earlier "iPhone class" (SE → 16 Pro Max)
  verification set — the layout is **state-aware (folded/unfolded)**, built on
  logical units + safe-area insets, WCAG 2.2 AA semantics (`<dialog>`,
  `role="tablist"`, `aria-live="polite"`, `44×44 CSS px` touch targets), and
  base-path-scoped `BroadcastChannel` (`"simple-budget-sync"` vs. `"simple-budget-sync-pr-<N>"`, OQ-1) multi-tab sync. See
  [frontend.md → responsive viewport](frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2).
- **Insights / search surface** (reqs 4 & 9): search & filter by period + tag +
  type, and tag-based rollup (`searchActivities` / `summarizeByTag`) rendered
  from the activity log — supporting 5-year tag analysis without a stored
  aggregate. See [activity-model.md](activity-model.md#insights--search) and
  [frontend.md → search / insights](frontend.md#search--insights-reqs-4--9).
- **Integer-cent money** (req 10): all amounts stored as integer `amountCents`
  (minor units); decimal-unit conversion only at the display boundary. Integer
  arithmetic throughout. See
  [data-model.md → derived values](data-model.md#derived-values-never-stored)
  and [frontend.md → money](frontend.md#money-integer-cents--req-10).
- **IndexedDB `DB_VERSION = 1` schema versioning, storage durability & post-MVP
  extensibility seams (Pillars 4 & 5)**: deterministic `onupgradeneeded`
  migrations (`"meta"`, `"rules"`, `"activities"` stores and secondary indexes
  `by_dateTime`, `by_type`, `by_tags`, `by_rule_period` — active vs. paused
  rules are filtered in memory since booleans are invalid IndexedDB keys),
  first-action `navigator.storage?.persist?.()` + `persisted()` status and
  N-day backup nag in Settings (plus an OQ-4 durable native store release gate
  for store submissions), and non-breaking post-MVP extension seams for category
  envelopes (`BudgetTarget`), multi-period trends (`summarizeByPeriod`), flexible
  cadences, split transactions, multi-account transfers, passphrase-encrypted
  backup envelopes (`PBKDF2-HMAC-SHA256` + `AES-256-GCM`), reserved `deletedAt?` /
  `deviceId?` tombstones for E2EE sync, first-class CSV/OFX/QFX file import
  (`importBatchId`, `externalTxnId`), and opt-in bank sync (noting that
  aggregator-based bank sync is a separate project that re-opens Pillar 2). See
  [storage.md → IndexedDB schema versioning](storage.md#indexeddb-schema-versioning-indexes--migration-strategy),
  [data-model.md → Activity](data-model.md#2-activity--a-concrete-independent-always-editable-record),
  and [data-model.md → post-MVP extensibility](data-model.md#post-mvp-extensibility--growth-seams).
- **UTC-stored, local-TZ display** (req 7): the backend stores ISO-8601 UTC
  instants; the frontend renders them in the user's local timezone via
  `Intl.DateTimeFormat`. See [frontend.md → time display](frontend.md#time--timezone-display-req-7).
- **Execution & build order (Iterative Phases 1–3, 4A–4D, 5 PWA MVP + Phase 6 Native Shell & Store Submission)**:
  a sequenced implementation blueprint mapped to ~8 right-sized MVP stories
  (Phase 1: Toolchain, Security/CSP & CI Gate Bootstrap → Phase 2: Pure Core
  Domain, Validation, Recurring Engine & Insights → Phase 3: IndexedDB Storage
  Layer & `BudgetApi` → Phase 4A: Walking Skeleton — App Shell,
  `PlatformServices` Seam, Smoke Chromium/WebKit E2E & Mode-(a) `gh-pages`
  Deploy → Phase 4B: Budget Tab + Co-Shipped E2E → Phase 4C: Insights &
  Settings Tabs + Co-Shipped E2E → Phase 4D: Offline PWA Manifest & Custom Vite
  SW Plugin + SW/Isolation E2E → Phase 5: MVP Release Hardening,
  Versioning/Tagging/Changelog Automation, Rollback/Roll-Forward Verification &
  Native CI Scaffolding → Phase 6: Native Shell Packaging (`native/` workspace),
  Store Compliance & Phased Mobile Releases) with executable verification gates
  at every phase, a release/rollback summary, and adopted Story #164 review
  defaults (**OQ-1..OQ-5**, with **OQ-5** flagged to the user for confirmation).
  See [build-order.md](build-order.md#adopted-review-defaults-story-164--oq-1oq-5).

## Per-area docs

| # | Area | Doc |
|---| ---- | --- |
| 1 | Local secure storage | [storage.md](storage.md) |
| 2 | Data model | [data-model.md](data-model.md) |
| 3 | Recurring-transaction engine | [recurring-engine.md](recurring-engine.md) |
| 4 | Transaction / activity model + insights/search | [activity-model.md](activity-model.md) |
| 5 | Frontend / UI surface (zero-prod-dep static bundle, iPhone-Duo foldable viewport, configurable base path) | [frontend.md](frontend.md) |
| 6 | Platform portability (one bundle / three webview targets, cross-platform static artifact, App Store / Play Store privacy) | [portability.md](portability.md) |
| 7 | Dependency strategy (zero prod deps + the well-maintained dev-dep & CI-action set + strict TypeScript baseline) | [dependency-strategy.md](dependency-strategy.md) |
| 8 | Testing & CI/CD strategy (unit, integration, E2E, headless live-test rules, mode-(a) same-site sub-path PR preview, credential-gated builds) | [testing.md](testing.md) |
| 9 | MVP execution & build order | [build-order.md](build-order.md) |

## Out of scope / future (explicitly NOT in the MVP)

- **Bi-weekly / weekly schedules and custom dates** — the recurring engine is
  designed to generalize, but the MVP only implements `monthly` (1st of month).
- **iOS + Android app shells** — the frontend *is* designed in-plan
  ([frontend.md](frontend.md)); shipping the Capacitor wrappers is a later
  delivery milestone. This plan guarantees the codebase is portable enough to
  run inside all three targets (PWA, iOS, Android).
- **Advanced analytics / dashboards** — the MVP ships the search + tag-rollup
  surface (reqs 4 & 9); richer analytics (budgets, forecasting, charts) are
  future work built on the same data model.
- **Automatic cloud sync** — backup is manual JSON export/import; iCloud Drive
  or server-based sync is out of MVP scope.
- **Client-side encryption** — see the
  [resolved MVP defaults](portability.md#resolved-mvp-defaults).
