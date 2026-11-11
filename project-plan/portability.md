# Platform portability

**Decision (spike #6):** shape the backend as a **pure, framework-agnostic
TypeScript library** — business logic + data model + a single
**storage-adapter** interface — and consume the *identical* library from both
platforms:

- **PWA** (now) — a browser app hosted on **GitHub Pages**.
- **iOS app** (later) — wrapped with **Capacitor**, which runs the app in
  **WKWebView / WebKit**.

The load-bearing fact: **WebKit fully supports IndexedDB and WebCrypto.** So the
exact same library that runs in the PWA runs unchanged inside the iOS shell —
**no fork, no platform-specific logic, no native bridge for the core.**

## The boundary

```
┌─────────────────────────────────────────────────────────────┐
│  FRONT-END (UI) — one per platform, NOT part of the library  │
│  ┌──────────────────────────┐   ┌──────────────────────────┐│
│  │ PWA (React/Vue/vanilla,  │   │ iOS shell (Capacitor /    ││
│  │ GitHub Pages)            │   │ WKWebView)               ││
│  └────────────┬─────────────┘   └────────────┬─────────────┘│
│               │ both import & call the SAME   │             │
│               ▼                               ▼             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  BACKEND LIBRARY (framework-agnostic TS)  ◄── THIS PLAN  ││
│  │  • data model (RecurringRule, Activity)                 ││
│  │  • recurring engine (pure logic)                        ││
│  │  • derived Available Funds (pure logic)                 ││
│  │  • CRUD / validation                                     ││
│  │  • a thin StorageAdapter interface (the ONLY platform   ││
│  │    surface) ── impl: IndexedDB (WebKit)                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

- **Backend = data + logic + the storage-adapter *interface*.** It knows nothing
  about React, Vue, the DOM, or iOS. It depends only on the Web platform
  capabilities that WebKit provides (IndexedDB, WebCrypto, `Date`, `crypto.randomUUID`).
- **Front-end = UI only.** It renders and calls the library's exported API. Each
  platform has its own UI shell, but both shells import and call the *same*
  functions.
- **The only thing that could ever be platform-specific is the storage-adapter
  *implementation* — and for WebKit it's just IndexedDB**, so even that is shared.
  The interface is what keeps the option open (see [storage.md](storage.md)).

## Module layout

```
src/
  core/                 # PURE — no storage, no DOM, no framework. Unit-testable.
    types.ts            #   RecurringRule, Activity, Schedule, enums
    engine.ts           #   runRecurringEngine, missingPeriods, alreadyPosted
    funds.ts            #   computeAvailableFunds
    validate.ts         #   field validation / invariants
  storage/
    adapter.ts          #   the StorageAdapter interface (open/save/delete/query)
    indexeddb.ts        #   IndexedDB implementation of StorageAdapter (WebKit)
    memory.ts           #   in-memory implementation (for tests)
  budgetApi.ts          # the PUBLIC API surface (see below) — the only thing
                        #   the front-end imports
  index.ts              # re-exports budgetApi
```

**Rule:** `core/` must have **zero** imports from `storage/` and zero imports of
any DOM / framework / Node global. `core/` takes data in (arrays of
`RecurringRule` / `Activity`) and returns data out (the new/updated records to
persist). `budgetApi.ts` is the composition root that wires `core/` to a
`StorageAdapter` implementation.

This layering is what makes the library portable: `core/` is pure and thus runs
anywhere; `storage/` is the only seam; `index.ts` is the door the front-end walks
in through.

## The public API (what the front-end calls)

This is the **interface the backend exposes**. A front-end engineer (PWA or iOS)
only ever sees these — never the internals of `core/` or `storage/`.

```ts
// Everything is async and returns plain data (no framework state).
interface BudgetApi {
  // Lifecycle
  init(): Promise<void>;                    // opens the store; idempotent

  // Recurring rules
  addRule(rule: NewRule): Promise<RecurringRule>;
  editRule(id: string, patch: RulePatch): Promise<RecurringRule>;
  setRuleActive(id: string, active: boolean): Promise<RecurringRule>;
  deleteRule(id: string): Promise<void>;    // does NOT delete posted activities
  listRules(): Promise<RecurringRule[]>;

  // Activities
  addActivity(a: NewActivity): Promise<Activity>;
  editActivity(id: string, patch: ActivityPatch): Promise<Activity>;
  deleteActivity(id: string): Promise<void>;
  listActivities(filter?: ActivityFilter): Promise<Activity[]>;

  // Recurring engine
  runRecurringEngine(now?: Date): Promise<{ posted: Activity[] }>;

  // Derived
  getAvailableFunds(): Promise<number>;
}
```

- **`NewRule` / `NewActivity`** are the input shapes (without system-managed
  fields like `id`, `createdAt`, `updatedAt`, which the API generates).
- **`RulePatch` / `ActivityPatch`** are partial updates — only the user-editable
  fields (enforced by the type, so a UI can't accidentally set `source` or
  `sourceRuleId`).
- **`runRecurringEngine()`** is the single call that makes recurring income /
  expenses "come through" — safe to call on app start, on focus, or on a timer,
  because it is idempotent ([recurring-engine.md](recurring-engine.md)).
- **`getAvailableFunds()`** returns the derived value; the UI never stores it.

### Example — PWA vs. iOS calling the *same* API

```ts
import { createBudgetApi } from "budget-lib"; // the library's public entry

const budget = createBudgetApi({ adapter: new IndexedDbAdapter() });

await budget.init();
await budget.addRule({ name: "Salary", type: "income", amount: 5000,
                       schedule: { cadence: "monthly", dayOfMonth: 1 } });
await budget.runRecurringEngine();                 // posts the due period
const funds = await budget.getAvailableFunds();     // derived, always current
```

The identical code is the body of both the PWA and the iOS shell. The iOS app is
Capacitor wrapping a `WKWebView` that loads the same bundle; the only platform
difference is the shell, not the logic.

## What this buys

- **One codebase, two platforms.** No fork, no "iOS copy" of the logic to keep
  in sync.
- **Testable core.** `core/` is pure, so the recurring engine and the Available
  Funds derivation are unit-tested with the in-memory adapter — no browser, no
  device.
- **Swappable storage.** The `StorageAdapter` interface means we can swap
  IndexedDB for an encrypted layer or another backend later without touching the
  engine or the front-end.
- **No accidental coupling.** Because `core/` cannot import the DOM or a
  framework, the library is *structurally* portable, not just "we try not to".

## Open decisions

These are carried across the plan and summarized here. They are **open** —
documented, recommended, and *not blocking* the MVP.

### A. Client-side encryption — in scope for the MVP or deferred?

- **Recommendation: defer.** "Purely locally and securely" is already satisfied
  by on-device storage + **zero network egress** (see [storage.md](storage.md)).
- If in scope, it is a **WebCrypto** field-level encryption layer keyed by a
  user passphrase, slotted in behind the same `StorageAdapter` interface — no
  rewrite of the engine or data model.
- **Why it's a decision:** encryption changes the UX (passphrase prompt, key
  recovery if forgotten) and the threat model. It does not change the data shape
  or the API surface, so deferring it costs nothing structurally.
- **Decision needed by:** the product/project owner, before the storage
  implementation ticket is built.

### B. Is `deposit` a first-class type, or an income-type Activity with a tag?

- **Recommendation: first-class `deposit`** — the user's ask explicitly names
  "deposits" as a manual entry distinct from income, and a first-class type keeps
  the Available Funds and any future analytics unambiguous.
- Current model already treats `deposit` as first-class on `Activity`
  (`type ∈ {income, expense, deposit}`) while *not* allowing it on `RecurringRule`
  (recurring rules are `income | expense` only). See
  [data-model.md](data-model.md) and [activity-model.md](activity-model.md).
- **Alternative:** model a deposit as `type: "income"` + `tags: ["deposit"]`.
  This removes a type value but muddies "money in" (salary) vs. "money in
  (deposit)" in reports.
- **Decision needed by:** product owner. It is a **one-line** change to the
  `ActivityType` union either way — cheap to make now or later.

### C. Back-fill on re-enable (from the recurring engine)

- Current behavior: **re-enabling a disabled rule back-fills** every due period
  that was skipped, idempotency-guarded (see
  [recurring-engine.md → notes](recurring-engine.md#notes-and-open-questions)).
- **Alternative:** advance `lastPostPeriod` to `now` when a rule is disabled, so
  a re-enabled rule does *not* back-fill (treats skipped periods as forgiven).
- **Decision needed by:** product owner. Both are small, localized changes;
  back-fill is the current recommendation because it preserves the user's
  obligations.

## Mapping the user's ask → portability

| User's ask | Portability answer |
| ---------- | ------------------ |
| "store data purely locally and securely" | on-device IndexedDB, zero network egress (see [storage.md](storage.md)) |
| "download it as a PWA using GitHub Pages" | the library is a plain TS bundle a PWA can import; front-end = PWA UI shell |
| "create an iOS app (developer subscription purchased)" | Capacitor + WKWebView runs the *same* library; only the shell differs |
| "the same code runs in a PWA now and an iOS app later" | framework-agnostic TS library + storage-adapter seam (this doc) |
| "backend should support … so a front-end can be built on top" | the `BudgetApi` public interface is the contract the front-end implements against |
