# Budget App Plan

This is the **full plan** for the simple budget app. It is a navigable,
agent-consumable set of documents: this file is the index, and each of the
eight per-area docs is a self-contained hub you can read on its own.

Grounded in the user's ask (Story #5), the solutions-architect's design
findings (signed comment on spike #6), extended by **Story #21** to add
**Android** as a first-class platform and a codified **dependency strategy**
(spike #22), and completed by **Story #115** to add the **frontend/PWA plan**,
the **insights/search surface**, **integer-cent money**, and **bank-OAuth
slots**. **No code in this story** — the deliverable is this plan. A
software-engineer should be able to decompose it into task tickets and start
implementing.

## How to navigate

```
README.md  (you are here — what this is, MVP scope, links, out-of-scope)
    ├── storage.md              — where/how data is persisted locally, securely
    ├── data-model.md           — entities, field definitions, types, relationships
    ├── recurring-engine.md     — how recurring income/expense auto-posts (idempotent)
    ├── activity-model.md       — the unified, editable Activity record + insights/search
    ├── frontend.md             — the PWA / UI surface (PWA-first, iOS/Android later)
    ├── portability.md          — PWA + iOS + Android boundary + shared BudgetApi
    ├── dependency-strategy.md  — zero prod deps + the well-maintained dev-dep & CI-action set (Story #21)
    └── testing.md              — Testing & CI/CD strategy (unit, integration, E2E, headless live-test rules, GitHub-Pages PR# preview, Android/iOS credential-skip builds)
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
- **Portable**: the same codebase runs as a **PWA (GitHub Pages)** now, and as
  **iOS** and **Android** apps (Capacitor shells) later. One bundle, three
  webview targets — see [portability.md](portability.md).
- **Zero production dependencies**: the app (backend *and* frontend) uses only
  Web-platform APIs (IndexedDB, WebCrypto, `fetch`, `Date`/`Intl`, `crypto.randomUUID`,
  pure TS logic). `package.json` `dependencies` is empty — see
  [dependency-strategy.md](dependency-strategy.md).
- **Insights / search surface** (reqs 4 & 9): search & filter by period + tag +
  type, and tag-based rollup (`searchActivities` / `summarizeByTag`) rendered
  from the activity log — supporting 5-year tag analysis without a stored
  aggregate. See [activity-model.md](activity-model.md#insights--search) and
  [frontend.md → search / insights](frontend.md#search--insights-reqs-4--9).
- **Integer-cent money** (req 10): all amounts stored as integer `amountCents`
  (minor units); decimal-unit conversion only at the display boundary. Integer
  arithmetic throughout. See
  [data-model.md → derived values](data-model.md#derived-values-never-stored)
  and [frontend.md → money](frontend.md#money-integer-cents-req-10).
- **Bank-OAuth slots** (reserved, not implemented): the data model reserves
  slots for future bank-sync integration (`source: "bank-sync"`,
  `externalTxnId`, `sourceAccountId`) without foreclosing the design. See
  [data-model.md → Activity](data-model.md#2--activity--a-concrete-independent-always-editable-record).
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
| 5 | Frontend / PWA (PWA-first, iOS/Android later) | [frontend.md](frontend.md) |
| 6 | Platform portability | [portability.md](portability.md) |
| 7 | Dependency strategy (zero prod deps + well-maintained dev-dep & CI-action set) | [dependency-strategy.md](dependency-strategy.md) |
| 8 | Testing & CI/CD strategy (unit, integration, E2E, headless live-test rules, GitHub-Pages PR# preview, Android/iOS credential-skip builds) | [testing.md](testing.md) |

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
