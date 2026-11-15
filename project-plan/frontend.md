# Frontend / PWA

**Decision (story #115):** the frontend is a **first-class, designed area of the
plan** — not a separate app build and not "out of scope." It is a **zero-prod-dep
shell** (Web-platform APIs + the backend library only) that renders **all ten
requirements**, delivered **PWA-first** (GitHub Pages) now and **iOS (primary,
iPhone) + Android** later via the existing portability model.

This is the **design-of-record for the UI surface**. It is a *plan* doc — it
describes **what the frontend must render and how it uses the backend** — not an
implementation spec with code. It deliberately **inherits** two hard constraints
defined elsewhere and **links** them rather than re-stating their rationale:

- **Zero production dependencies** — `package.json` `dependencies` is empty. See
  [dependency-strategy.md](dependency-strategy.md).
- **Portability boundary + public API** — the frontend is one of three UI shells
  (PWA / iOS / Android) that all import and call the *same* backend library. See
  [portability.md](portability.md).

Everything the frontend *computes or stores* lives in the backend library
([data-model.md](data-model.md), [activity-model.md](activity-model.md),
[recurring-engine.md](recurring-engine.md), [storage.md](storage.md)). The
frontend's job is to **collect input, render derived values, and call the
`BudgetApi` surface** ([portability.md → the public API](portability.md#the-public-api-what-the-front-end-calls)).

## How this maps to the requirements

| # | Requirement | Frontend answer | Section |
|---|-------------|-----------------|---------|
| 1 | Zero production dependencies | zero-prod-dep shell; `dependencies: {}` | [Zero production dependencies](#zero-production-dependencies-req-1) |
| 2 | Deployable on PWA / iOS / Android | PWA first-class; iOS (primary) + Android via portability model | [Platforms](#platforms-req-2) |
| 3 | Local-only storage / backup | manual JSON export/import; no server | [Export / backup](#export--backup-req-3) |
| 4 | Fast 5-year tag analysis / insights | tag-based search + rollup rendered from the backend surface | [Search / insights](#search--insights-reqs-4--9) |
| 5 | Recurring income/expense (default 1st, configurable) | "set recurring" form; day configurable | [Recurring income/expense](#recurring-income--expense-req-5) |
| 6 | Add expenses and deposits | entry form (manual income / expense / deposit) | [Add an expense / deposit / income](#add-an-expense--deposit--income-req-6) |
| 7 | UTC-stored, local-timezone display | render `dateTime` (stored UTC) in the user's local TZ | [Time display](#time--timezone-display-req-7) |
| 8 | Modify any transaction, tags, backdate | edit form for every field; add/remove tags | [Edit / backdate / tags](#edit--backdate--tags-req-8) |
| 9 | Search / filter by period + tag | search UI over period + tag + type | [Search / insights](#search--insights-reqs-4--9) |
| 10 | Store cents as integer | UI renders integer `amountCents` as decimal only at the display boundary | [Money](#money-integer-cents-req-10) |

## Platforms (req 2)

The frontend is **portable by construction**: it is the *UI shell* side of the
boundary in [portability.md](portability.md), which is the source of truth for the
three targets and the shared `BudgetApi` contract. This doc does **not** duplicate
that model — it only states what the frontend is for each target:

- **PWA (now, primary shipping target)** — the same bundle hosted on **GitHub
  Pages** (HTTPS, a secure context). This is the first thing that ships.
- **iOS (later, primary native target — iPhone)** — the PWA bundle wrapped in a
  **Capacitor** shell running in **WKWebView / WebKit**.
- **Android (later)** — the *same* bundle wrapped in a **Capacitor** shell
  running in the **Android System WebView (Chromium)**.

**One codebase, three webview targets, no fork.** Because all three targets
implement the same Web platform APIs (IndexedDB, WebCrypto, `Date`/`Intl`,
`crypto.randomUUID`), the frontend is written once against those built-ins and the
shared `BudgetApi`, and the only difference between targets is the native shell.
See [portability.md → the boundary](portability.md#the-boundary),
[portability.md → android-specific considerations](portability.md#android-specific-considerations),
and [dependency-strategy.md](dependency-strategy.md) for why this is possible with
zero production dependencies.

## Zero production dependencies (req 1)

**The frontend is a zero-prod-dep shell.** `package.json` `dependencies` **MUST
stay empty** — there is **no React/Vue/Svelte/any framework runtime dependency in
production**. The UI is satisfiable with `dependencies: {}` because every concern
the frontend needs is covered by a **built-in Web-platform API** that exists in
**all three targets**, plus the **backend library** (which is itself
zero-prod-dep):

| Frontend concern | Built-in API (all 3 targets) |
|------------------|------------------------------|
| Rendering / DOM | the platform DOM (`document`, `Element`) — no framework required |
| State | plain TypeScript state + event handlers (no state library) |
| Date / time formatting (req 7) | **`Intl.DateTimeFormat`** / **`Intl.NumberFormat`** |
| Money formatting (req 10) | **`Intl.NumberFormat`** (decimal-unit display of integer `amountCents`) |
| Persistence | **IndexedDB** (via the backend `StorageAdapter` — the UI never touches it directly) |
| Local backup (req 3) | **File System Access API** / download + file-input for JSON export/import |
| Offline / installable | standard **PWA** primitives (service worker + manifest) |
| IDs, crypto (if ever surfaced) | **`crypto.randomUUID()`**, **WebCrypto** |

The **only** runtime code in the bundle is the frontend's own TypeScript and the
shared backend library — **no third-party production package.** Build/test/lint
tooling (Vite, Vitest, Biome, tsc, Playwright) lives in `devDependencies` and is
**not** a production dependency (see
[dependency-strategy.md → dev dependencies](dependency-strategy.md#dev-dependencies-the-allowed-set)).

> **Guardrail (inherited):** a PR that introduces a production dependency —
> including a frontend framework runtime dep — requires an explicit justification
> and senior-software-engineer sign-off (see
> [dependency-strategy.md → guardrails](dependency-strategy.md#guardrails-enforce-in-ci--review)).

This is why the "no React/Vue in production" reading of the user's "shouldn't need
any additional packages in production" ask is coherent: the UI is plain TS/HTML
rendering against the `BudgetApi` surface, and `dependencies` stays empty.

## Add an expense / deposit / income (req 6)

An **entry form** that creates a manual `Activity` via `budget.addActivity(...)`:

- **Type:** `income` | `expense` | `deposit` — `deposit` is a **first-class**
  manual type (see
  [portability.md → resolved MVP default B](portability.md#resolved-mvp-defaults)).
  Recurring rules are `income | expense` only; `deposit` is entered here as a
  manual transaction.
- **Amount:** a decimal-unit input (`$1,234.56`) that the boundary converts to the
  canonical integer `amountCents` (see [Money](#money-integer-cents-req-10)).
- **Date/time:** optional; defaults to "now" (see [Time display](#time--timezone-display-req-7)).
- **Tags / category:** free-form tag input (see [Edit / backdate / tags](#edit--backdate--tags-req-8)).
- **Currency:** ISO-4217, default USD.
- **Provenance:** `source: "manual"` is set by the API; the form never edits it.

On submit the form calls `budget.addActivity(NewActivity)` and the returned
`Activity` is what the UI displays.

## Recurring income / expense (req 5)

A **"set recurring" form** that creates/edits a `RecurringRule` via
`budget.addRule(...)` / `budget.editRule(...)`:

- **Type:** `income` | `expense` (never `deposit`).
- **Amount:** decimal-unit input → integer `amountCents`.
- **Schedule:** MVP is **monthly, day 1** (`cadence: "monthly", dayOfMonth: 1`).
  The **day is configurable** in the form; bi-weekly / weekly / custom cadences are
  **reserved** in the `Schedule` shape but **out of MVP scope** (see
  [data-model.md → the two core entities](data-model.md#the-two-core-entities)).
- **Active / pause:** a toggle (`active: boolean`); pausing never deletes posted
  history.

The form renders the rule's **origin**, not its postings: editing a rule changes
only *future* periods, and already-posted activities remain independent, editable
records. How the engine auto-posts due periods is the backend's concern — see
[recurring-engine.md](recurring-engine.md). The frontend triggers posting by
calling `budget.runRecurringEngine()` (idempotent) on app start / focus.

## Edit / backdate / tags (req 8)

**Every `Activity` is editable** — manual *and* recurring-posted — through one
identical edit form. The form exposes exactly the user-editable fields and nothing
else (the `RulePatch`/`ActivityPatch` types enforce this, so the UI *cannot* set
provenance):

| Field | Editable | Notes |
|-------|----------|-------|
| `type` | yes | e.g. reclassify an auto-posted expense as `deposit` |
| `amountCents` | yes | decimal-unit input → integer cents |
| `dateTime` | yes | **backdate** or forward-date (see [Time display](#time--timezone-display-req-7)) |
| `tags` | yes | **add / remove any** free-form tags / categories |
| `memo` | yes | free text |
| `source`, `sourceRuleId`, `period`, `createdAt`, `updatedAt` | **no** | provenance + system fields, not user-set |

- **Tags / categories** are free-form strings on every activity (no schema in the
  MVP); a shared tag list / autocomplete is a future enhancement. See
  [activity-model.md → tagging](activity-model.md#tagging).
- **Backdating** is a normal edit: setting `dateTime` to an earlier date is fully
  supported, and Available Funds re-derives automatically.
- Saving is a single `budget.editActivity(id, ActivityPatch)` upsert. See
  [activity-model.md → editing any activity](activity-model.md#editing-any-activity).

## Search / insights (reqs 4 & 9)

The frontend renders the **backend's insights/search surface** — it does not
compute or store any aggregate. It calls `budget.searchActivities(filter)` to
filter and `budget.summarizeByTag(activities)` to roll up, both pure and derived
from the activity log (integer cents, plain data). The contract lives in
[activity-model.md → insights / search](activity-model.md#insights--search) and the
`BudgetApi` in [portability.md → the public API](portability.md#the-public-api-what-the-front-end-calls).

The UI offers **search / filter** over the **period + tag + type** predicates
(intersecting; omit a predicate to leave it unbounded):

- **Period (req 9):** a date-range picker mapped to `since` / `until` (ISO-8601
  bounds on the stored UTC `dateTime`) — e.g. "all of 2026", "Q3 2026", a rolling
  5-year window.
- **Tag (reqs 4, 9):** a tag selector (the user's own tags) mapped to `tag`.
- **Type (req 4):** `income` | `expense` | `deposit` (e.g. "where did my **spend**
  go by tag").

**Insight** = `budget.summarizeByTag(budget.searchActivities({ since, until, tag, type }))`,
rendered as a per-tag breakdown of **money in** vs. **money out** over the chosen
period (e.g. *housing expense in Q3 2026*). Because both operations are pure and
derived from the log, a **5-year history** is just a wider range — the frontend
scales with it without any stored aggregate or analytics engine.

## Time / timezone display (req 7)

**Storage is UTC; display is local.** This is the display-layer half of the rule
that the backend stores ISO-8601 UTC (`Activity.dateTime`, the engine's
`dueDateTime`).

- The frontend **never** mutates the stored UTC instant.
- It **renders** `dateTime` in the **user's local timezone** using
  `Intl.DateTimeFormat` (and `Intl.NumberFormat` for money), which respects the
  runtime's locale/timezone.
- The **backdate / date picker** produces a UTC instant for the user's chosen local
  date/time and passes it through to the API; the round-trip keeps storage UTC and
  display local.
- Recurring postings show the **due date** (e.g. the 1st) in the local timezone,
  matching the "the transaction happened on the 1st" semantics.

> The backend treats a recurring due date as **midnight UTC** on `dayOfMonth`
> (a documented MVP simplification); the frontend renders whatever UTC instant the
> log holds, in the user's zone. See
> [recurring-engine.md → notes](recurring-engine.md#notes-and-resolved-defaults).

## Money (integer cents — req 10)

The frontend works in **decimal units at the boundary** and **integer cents in the
backend**:

- **Input:** the amount field accepts a human decimal unit (`$40.00`) and is
  converted to the canonical **integer `amountCents`** (minor units) at the
  boundary before calling the API.
- **Output:** integer `amountCents` is rendered as a decimal via
  `Intl.NumberFormat` (currency) at the display boundary.
- **Never** does the UI perform money arithmetic or store a decimal. Available
  Funds, tag rollups, and the engine all operate on integer `amountCents` in the
  backend — see [data-model.md → derived values](data-model.md#derived-values-never-stored)
  and [activity-model.md → available funds](activity-model.md#available-funds--derived-from-the-activity-log).

## Export / backup (req 3)

The frontend offers **manual JSON export / import** — a local backup with **no
server**:

- **Export:** serialize the activity log + rules to a **JSON** file (a "backup"
  the user can save, e.g. to iCloud Drive, or copy off-device) via a download /
  the **File System Access API**.
- **Import:** read a previously exported JSON file and restore it through the
  backend, so the same records re-populate the on-device store.
- **No account, no network, no server** — backup is the user's file, consistent
  with the local-only, zero-egress storage model. See
  [storage.md → security properties](storage.md#security-properties).

This satisfies "download it as a PWA / keep my data" with **manual** backup;
automatic cloud sync (iCloud Drive / a server) is **out of MVP scope**.

## What the frontend is NOT

To keep the boundary sharp (see [portability.md → the boundary](portability.md#the-boundary)):

- **Not** a place where business logic lives — the recurring engine, Available
  Funds, validation, and search/rollup are all in the backend library.
- **Not** a place where data is stored — persistence is the backend's
  `StorageAdapter` (IndexedDB); the UI only reads derived values and collects
  input.
- **Not** a production-framework dependency — `dependencies` stays empty (req 1).
- **Not** a per-platform fork — PWA, iOS, and Android share the same frontend
  bundle; only the Capacitor shell differs (req 2).
