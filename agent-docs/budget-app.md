# The budget app

The **product** this repository builds: a simple budget app. Unlike the
orchestration system (which already exists and is documented in
[orchestration.md](orchestration.md)), the app is **built over time** by the
pipeline. This doc tracks what is real **now** and grows as each story ships.

Keep it split by area so a reviewer can read only what they need:

| Area | What it covers | Doc |
| ---- | -------------- | --- |
| **backend** | APIs, business logic, validation, persistence (integer-cent money, short-month `Date.UTC` clamping, `BudgetBackup` validation, insights/search, bank-sync slots) | _planned_ — [the app plan](#the-app-plan) |
| **frontend** | UI, components, state, how it talks to the backend (zero-prod-dep static bundle, strict CSP `connect-src 'none'`, safe DOM APIs, iPhone-Duo foldable viewport, configurable base path, **PWA-scoped** offline/installable) | _planned_ — [the app plan](#the-app-plan) |
| **data** | the budget data model, IndexedDB `DB_VERSION = 1` schema & indexes, atomic `replaceAll` restore, post-MVP extension seams | _planned_ — [the app plan](#the-app-plan) |
| **testing** | test pyramid (Vitest `>= 95%` core coverage, `fake-indexeddb`, Playwright 3-viewport E2E + zero-egress gate), CI pipeline, headless CLI verification rules, mode-(a) PR preview, credential-gated native builds | _planned_ — [the app plan](#the-app-plan) |

## The app plan

Before implementation begins, the app is **planned** (not yet built). The
navigable, agent-consumable plan lives at the repo root under
[`project-plan/`](../project-plan/README.md) — a per-area set of docs covering
the data model, local secure storage, the recurring-transaction engine, the
activity model (integer-cent money, insights/search surface, bank-sync slots),
the **frontend / UI** surface (a zero-prod-dep **static bundle**, strict CSP
`connect-src 'none'` & DOM XSS ban, the **iPhone-Duo foldable viewport** —
folded = baseline 1-page / unfolded = enhanced 1-page, slab phones ≈ folded —
and a **configurable base path**), platform portability (one bundle, three
webview targets, **cross-platform static artifact**, and Apple App Store /
Google Play Store **"Data Not Collected"** privacy compliance), the dependency
strategy (zero production deps + the **well-maintained dev-dep & CI-action
set** + strict TypeScript compiler flags), the testing & CI/CD strategy
(unit/integration/E2E, **mode-(a) same-site sub-path PR preview** with
production-untouched + prune-on-merge, **credential-gated** native builds), and
the **5-phase MVP execution & build order** ([project-plan/build-order.md](../project-plan/build-order.md)).

| Area | Doc |
| ---- | --- |
| Index / MVP scope | [project-plan/README.md](../project-plan/README.md) |
| Data model (`RecurringRule`, `Activity`, `BudgetBackup`, post-MVP seams) | [project-plan/data-model.md](../project-plan/data-model.md) |
| Local secure storage (`DB_VERSION = 1`, indexes, atomic `replaceAll`, WebKit durability) | [project-plan/storage.md](../project-plan/storage.md) |
| Recurring engine (idempotent auto-posting, short-month `Date.UTC` clamping) | [project-plan/recurring-engine.md](../project-plan/recurring-engine.md) |
| Activity model (integer-cent money, insights/search) | [project-plan/activity-model.md](../project-plan/activity-model.md) |
| Frontend / UI (zero-prod-dep static bundle, strict CSP & safe DOM, iPhone-Duo foldable viewport, configurable base path) | [project-plan/frontend.md](../project-plan/frontend.md) |
| Portability (one bundle / three webview targets, `native/` package boundary + `PlatformServices` seam, App Store & Play Store privacy & Store Submission Checklist) | [project-plan/portability.md](../project-plan/portability.md) |
| Dependency strategy (zero prod deps in web bundle + isolated `native/` shell + well-maintained dev-dep & CI-action set + strict `tsconfig.json`) | [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md) |
| Testing & CI/CD (test pyramid, `>= 95%` core coverage, zero-egress E2E gate, mode-(a) PR preview, credential-gated native builds) | [project-plan/testing.md](../project-plan/testing.md) |
| MVP execution & build order (5-phase PWA MVP + Phase 6 native shell & store submission + 5-pillar matrix) | [project-plan/build-order.md](../project-plan/build-order.md) |

> The plan is the design-of-record. When an area *ships*, the
> `budget-app/<area>.md` area doc above will track what is real in code; the
> plan stays as the design-of-record.

When an area ships, add a `budget-app/<area>.md` with the details and link it
here; add its key terms to the [glossary](glossary.md). Do **not** inline a whole
area's detail into this file — keep it a short map.

## Key decisions

- **Execution Order (5-Phase PWA MVP + Phase 6 Native Shell & Store Submission, [project-plan/build-order.md](../project-plan/build-order.md)):**
  1. **Phase 1 — Toolchain, Security/CSP Baseline & CI Gate Bootstrap:** `package.json` (`dependencies: {}`), `.npmrc` (`save-exact=true`), strict `tsconfig.json`, Biome, Vite (`VITE_BASE_PATH`), Vitest, Playwright, `index.html` (`<meta http-equiv="Content-Security-Policy">` with `connect-src 'none'`), and `.github/workflows/ci.yml` + `main` branch protection before any feature code.
  2. **Phase 2 — Pure Core Domain, Validation, Recurring Engine & Insights (`src/core/`):** Pure TypeScript types, integer-cent & 10 MB prototype-pollution-safe `validateBackupPayload`, recurring `missingPeriods` with short-month `daysInMonth` clamping, `computeAvailableFunds`, and `searchActivities`/`summarizeByTag` with `>= 95%` line/branch unit test coverage.
  3. **Phase 3 — IndexedDB Storage Layer (`DB_VERSION = 1` + Indexes + Atomic Restore) & Public `BudgetApi` (`src/storage/`, `src/budgetApi.ts`):** `StorageAdapter` with single-transaction atomic `replaceAll`, `IndexedDbAdapter` (`"meta"`, `"rules"`, `"activities"` stores and secondary indexes, `navigator.storage?.persist?.()`), `createBudgetApi` (`exportBackup` / `importBackup`), and `fake-indexeddb` integration/rollback tests.
  4. **Phase 4 — Zero-Prod-Dep Frontend UI, iPhone-Duo Dual-State Layout & Base-Path PWA Service Worker (`src/ui/`, `src/styles/`, `public/`, `sw.js`):** Safe DOM construction (zero `innerHTML`), WCAG 2.2 AA semantics (`<dialog>`, `role="tablist"`, `aria-live="polite"`, `44×44 CSS px` targets), `BroadcastChannel` multi-tab sync, `375×667` folded / `829×1194` unfolded CSS, and same-origin `sw.js`.
  5. **Phase 5 — Comprehensive Playwright E2E Suite, Zero-Egress/Security Audit Gates & Mode-(a) GitHub Pages Deploy (`e2e/`, `.github/workflows/deploy-pages.yml`):** Full E2E suite on Chromium + WebKit across `375×667`, `829×1194`, and `390×844` viewports with `context.on("request")` zero-external-egress proof, DOM XSS payload immunity tests, and serialized mode-(a) sub-path PR preview deployments.
  6. **Phase 6 — Native Shell Packaging (`native/` Workspace) & App Store / Play Store Submission (Post-MVP):** Isolated `native/` workspace package (`native/package.json`, `native/capacitor.config.ts` with `webDir: "../dist"`, `WKAppBoundDomains`), `PlatformServices` runtime seam (`window.Capacitor`, zero `@capacitor/*` in `src/`), OQ-4 durable native store behind `StorageAdapter`, Android `allowBackup="false"` + `dataExtractionRules` (OQ-3), iOS `ITSAppUsesNonExemptEncryption=false` + Xcode Privacy Report-derived `PrivacyInfo.xcprivacy`, and Store Submission Checklist.
- **5-Pillar Security, Privacy & Extensibility Guarantees:**
  - **Pillar 1 (Security):** Strict W3C CSP3 `<meta>` (`connect-src 'none'`), zero `innerHTML` / unsafe DOM sinks, 10 MB prototype-pollution-safe `BudgetBackup` validation (`__proto__` / `constructor` / `prototype` rejected), single-transaction atomic IndexedDB `replaceAll` restore, and `.npmrc` `save-exact=true` + `pnpm audit --audit-level=high`.
  - **Pillar 2 (Store Privacy):** 100% on-device storage and zero network egress qualify for Apple App Store Connect **"Data Not Collected"** and Google Play Console **"No data shared / No data collected"**, backed by iOS `ITSAppUsesNonExemptEncryption=false` + Xcode Privacy Report-derived `PrivacyInfo.xcprivacy`, Android `allowBackup="false"` + `dataExtractionRules` + `AD_ID` removal, Store Submission Checklist, and automated Playwright zero-egress verification.
  - **Pillars 3–5 (Build/Test, Modern Tech Stack, Post-MVP Extensibility):** Strict TypeScript flags, `>= 95%` `src/core/` coverage, short-month `Date.UTC` clamping, WebKit `navigator.storage.persist()` durability, `DB_VERSION = 1` schema migration switch, and non-breaking seams for category envelopes, multi-period analytics, flexible cadences, split transactions, multi-account transfers, and bank-sync/OAuth.

## Conventions

- A **software-engineer** updating an area should keep the matching
  `budget-app/<area>.md` accurate and add new glossary terms.
- The **docs-agent** reconciles everything here against the code before the
  feature PR merges to `main`.
