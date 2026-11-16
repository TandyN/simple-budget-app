# Budget App Plan

This is the **full plan** for the simple budget app. It is a navigable,
agent-consumable set of documents: this file is the index, and each of the
eight per-area docs is a self-contained hub you can read on its own.

Grounded in the user's ask (Story #5), the solutions-architect's design
findings (signed comment on spike #6), extended by **Story #21** to add
**Android** as a first-class platform and a codified **dependency strategy**
(spike #22), completed by **Story #115** to add the **frontend/PWA plan**,
the **insights/search surface**, **integer-cent money**, and **bank-OAuth
slots**, and refined by **Story #131** to lock in the **well-maintained
dev-dep criterion**, the **mode (a) same-site sub-path PR preview**
(production-untouched + prune-on-merge), the **zero-prod-dep, cross-platform
static bundle**, and the **iPhone-Duo foldable viewport** as the primary
target. **No code in this story** — the deliverable is this plan. A
software-engineer should be able to decompose it into task tickets and start
implementing.

## How to navigate

```
README.md  (you are here — what this is, MVP scope, links, out-of-scope)
    ├── storage.md              — where/how data is persisted locally, securely
    ├── data-model.md           — entities, field definitions, types, relationships
    ├── recurring-engine.md     — how recurring income/expense auto-posts (idempotent)
    ├── activity-model.md       — the unified, editable Activity record + insights/search
    ├── frontend.md             — the UI surface (zero-prod-dep static bundle, iPhone-Duo foldable viewport, configurable base path)
    ├── portability.md          — one bundle / three webview targets boundary + shared BudgetApi + cross-platform static artifact
    ├── dependency-strategy.md  — zero prod deps + the well-maintained dev-dep & CI-action set (Story #21)
    └── testing.md              — Testing & CI/CD strategy (unit, integration, E2E, headless live-test rules, mode-(a) same-site sub-path PR preview with production-untouched + prune-on-merge, Android/iOS credential-gated builds)
```

Read in this order for a first pass: **data-model → storage →
recurring-engine → activity-model → frontend → portability →
dependency-strategy → testing**. Each doc links to the others where the
boundary matters.

## MVP scope (what the app must support)

- **Monthly income + recurring expenses**, both defaulting to the **1st of every
  month**. (Bi-weekly / weekly cadence and custom dates are future work.)
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
- **Local and secure**: data lives purely on the device, zero network egress.
- **Zero production dependencies**: the app (backend *and* frontend) uses only
  Web-platform APIs (IndexedDB, WebCrypto, `fetch`, `Date`/`Intl`, `crypto.randomUUID`,
  pure TS logic). `package.json` `dependencies` is empty — see
  [dependency-strategy.md](dependency-strategy.md).
- **Cross-platform static bundle (one artifact, no per-platform build)**: the
  build output is a single **static web bundle** (`vite build` → `dist/`) with an
  **empty `dependencies`**, and the **identical artifact** is served on **all
  phones** — the PWA (GitHub Pages) now and the iOS (WebKit) + Android (Chromium)
  Capacitor shells later. There is **no per-platform bundle, build flag, or code
  path** — cross-platform = the same web artifact on all devices; the only
  platform-specific surface is the Capacitor shell. See
  [portability.md → what this buys](portability.md#what-this-buys) and
  [frontend.md → zero production dependencies](frontend.md#zero-production-dependencies-req-1).
- **Well-maintained dev-dep set**: the **only** allowed dev dependencies are a
  small, curated toolchain (**pnpm** as package manager, **Vite**, **Vitest**,
  **Playwright**, **`fake-indexeddb`**, **Biome**, **tsc**) **and the CI
  actions** the pipeline runs, each of which must pass the **well-maintained
  criterion** (Active & current · First-party / tool-maintainer · Industry-standard).
  They are build/test/lint-time only — never shipped to a runtime. See
  [dependency-strategy.md → the well-maintained criterion](dependency-strategy.md#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency).
- **PR preview (mode a — same-site sub-path)**: every open PR gets a preview at
  `tandyn.github.io/simple-budget-app/pr-<PR#>/` — a **sub-path** of the same
  production site, built with a **configurable base path**
  (`VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/`). **Two guarantees:** the
  **production root is untouched** on a PR deploy (only `pr-<PR#>/` is written),
  and the **PR sub-path is pruned on merge/close**. See
  [testing.md → CI deploy & preview](testing.md#ci-deploy--preview-github-pages)
  and [frontend.md → base path](frontend.md#base-path-configurable-explicit-build-decision).
- **Responsive viewport target — iPhone-Duo foldable (dual-state)**: the
  **primary** viewport target is the **iPhone-Duo** foldable — **folded** = the
  baseline **1-page** experience (slab-like, every tab fits on one panel, no
  scroll); **unfolded** = the **enhanced 1-page** view (dual-panel, split-pane).
  **Slab phones (≈ folded) are the secondary target.** This **supersedes** the
  earlier "iPhone class" (SE → 16 Pro Max) verification set — the layout is
  **state-aware (folded/unfolded)**, not a mobile → tablet → desktop ladder, and
  is built on logical units + safe-area insets, not fixed pixel widths. See
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
- **Bank-OAuth slots** (reserved, not implemented): the data model reserves
  slots for future bank-sync integration (`source: "bank-sync"`,
  `externalTxnId`, `sourceAccountId`) without foreclosing the design. See
  [data-model.md → Activity](data-model.md#2-activity--a-concrete-independent-always-editable-record).
- **UTC-stored, local-TZ display** (req 7): the backend stores ISO-8601 UTC
  instants; the frontend renders them in the user's local timezone via
  `Intl.DateTimeFormat`. See [frontend.md → time display](frontend.md#time--timezone-display-req-7).

## Per-area docs

| # | Area | Doc |
|---| ---- | --- |
| 1 | Local secure storage | [storage.md](storage.md) |
| 2 | Data model | [data-model.md](data-model.md) |
| 3 | Recurring-transaction engine | [recurring-engine.md](recurring-engine.md) |
| 4 | Transaction / activity model + insights/search | [activity-model.md](activity-model.md) |
| 5 | Frontend / UI surface (zero-prod-dep static bundle, iPhone-Duo foldable viewport, configurable base path) | [frontend.md](frontend.md) |
| 6 | Platform portability (one bundle / three webview targets, cross-platform static artifact) | [portability.md](portability.md) |
| 7 | Dependency strategy (zero prod deps + the well-maintained dev-dep & CI-action set) | [dependency-strategy.md](dependency-strategy.md) |
| 8 | Testing & CI/CD strategy (unit, integration, E2E, headless live-test rules, mode-(a) same-site sub-path PR preview with production-untouched + prune-on-merge, Android/iOS credential-gated builds) | [testing.md](testing.md) |

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
