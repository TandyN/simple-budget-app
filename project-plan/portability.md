# Platform portability

**Decision (spike #6, extended to Android in spike #22 / Epic #21):** shape the
backend as a **pure, framework-agnostic TypeScript library** — business logic +
data model + a single **storage-adapter** interface — and consume the *identical*
library from all three targets:

- **PWA** (now) — a browser app hosted on **GitHub Pages**.
- **iOS app** (later) — wrapped with **Capacitor**, which runs the app in
  **WKWebView / WebKit**.
- **Android app** (later) — wrapped with **Capacitor**, which runs the app in the
  **Android System WebView (Chromium)**.

The framework is **Capacitor** (the iOS + Android native shells) wrapping the
existing framework-agnostic TS library; the PWA is the *same bundle* on GitHub
Pages. This is the spike-#6 architecture extended to Android — **one bundle,
three webview targets, no native rewrite.**

The load-bearing fact: **both WebKit (iOS) and Chromium (Android) fully support
IndexedDB and WebCrypto.** So the exact same library that runs in the PWA runs
unchanged inside *both* native shells — **no fork, no platform-specific logic, no
native bridge for the core.**

## The boundary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONT-END (UI) — one shell per target, NOT part of the library             │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│  │ PWA (React/Vue/vanilla, │ │ iOS shell (Capacitor /  │ │ Android shell           │
│  │ GitHub Pages)           │ │ WKWebView / WebKit)     │ │ (Capacitor / Chromium)  │
│  └────────────┬────────────┘ └────────────┬────────────┘ └────────────┬────────────┘
│               │ all three import & call the SAME backend library      │
│               ▼                               ▼                            ▼
│  ┌─────────────────────────────────────────────────────────────────────────────┐
│  │  BACKEND LIBRARY (framework-agnostic TS)  ◄── THIS PLAN                      │
│  │  • data model (RecurringRule, Activity)                                       │
│  │  • recurring engine (pure logic)                                              │
│  │  • derived Available Funds (pure logic)                                       │
│  │  • CRUD / validation                                                          │
│  │  • a thin StorageAdapter interface (the ONLY platform surface)                │
│  │    ── impl: IndexedDB (WebKit on iOS, Chromium on Android, all browsers in PWA)│
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Backend = data + logic + the storage-adapter *interface*.** It knows nothing
  about React, Vue, the DOM, iOS, or Android. It depends only on the Web platform
  capabilities that **WebKit (iOS) and Chromium (Android)** both provide (IndexedDB,
  WebCrypto, `Date`, `crypto.randomUUID`).
- **Front-end = UI only.** It renders and calls the library's exported API. Each
  target has its own UI shell (PWA, iOS, Android), but all three shells import and
  call the *same* functions.
- **The only thing that could ever be platform-specific is the storage-adapter
  *implementation* — and for both WebKit and Chromium it's just IndexedDB**, so even
  that is shared. The interface is what keeps the option open (see
  [storage.md](storage.md)).

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
     indexeddb.ts        #   IndexedDB implementation of StorageAdapter
                         #   (shared by iOS WebKit + Android Chromium + PWA browsers)
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

This is the **interface the backend exposes**. A front-end engineer (PWA, iOS, or
Android) only ever sees these — never the internals of `core/` or `storage/`.

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

### Example — PWA / iOS / Android calling the *same* API

```ts
import { createBudgetApi } from "budget-lib"; // the library's public entry

const budget = createBudgetApi({ adapter: new IndexedDbAdapter() });

await budget.init();
await budget.addRule({ name: "Salary", type: "income", amount: 5000,
                       schedule: { cadence: "monthly", dayOfMonth: 1 } });
await budget.runRecurringEngine();                 // posts the due period
const funds = await budget.getAvailableFunds();     // derived, always current
```

The identical code is the body of all three targets — the PWA, the iOS shell, and
the Android shell. The iOS app is Capacitor wrapping a `WKWebView` (WebKit) that
loads the same bundle; the Android app is Capacitor wrapping the Android System
WebView (Chromium) that loads the *same* bundle. The only platform difference is
the shell, not the logic.

## What this buys

- **One codebase, three targets.** No fork, no "iOS copy" or "Android copy" of the
  logic to keep in sync.
- **Testable core.** `core/` is pure, so the recurring engine and the Available
  Funds derivation are unit-tested with the in-memory adapter — no browser, no
  device.
- **Swappable storage.** The `StorageAdapter` interface means we can swap
  IndexedDB for an encrypted layer or another backend later without touching the
  engine or the front-end.
- **No accidental coupling.** Because `core/` cannot import the DOM or a
  framework, the library is *structurally* portable, not just "we try not to".

## Android-specific considerations

Android is a **third webview target of the same bundle** — the Android System
WebView is Chromium-based, so it implements the same Web platform the rest of the
plan relies on. Compared with iOS (WebKit) and the PWA (any modern browser), the
only differences are:

- **Storage:** Chromium fully supports **IndexedDB**, so the *same*
  `indexeddb.ts` adapter works on Android as on iOS — no shim for the core is
  needed. Storage is **app-scoped** (private to the app's data dir): no
  shared-storage concerns, no storage permission required. A SQLite-backed
  adapter is a valid *future* swap behind the unchanged `StorageAdapter`
  interface (see [storage.md](storage.md)).
- **WebCrypto:** fully available in Chromium WebView (`crypto.subtle`).
- **Secure-context nuance:** `crypto.randomUUID()` and `crypto.subtle` require a
  **secure context**. Capacitor serves from `capacitor://localhost` /
  `http(s)://localhost`, which *is* a secure context — but **verify during
  implementation**. (The PWA is HTTPS on GitHub Pages; already fine.)
- **Permissions:** none needed for the MVP (no network, app-scoped webview
  storage). Notifications / deep-links would need native permissions — both are
  out of MVP scope.
- **App lifecycle:** Android kills background processes aggressively (Doze).
  **Non-issue here:** the recurring engine runs **on app-open** (idempotent), not
  on a background timer — no background service required.
- **Deep linking:** Capacitor supports it; not in MVP.

**Net:** Android adds **no new backend dependency and no new core logic** — only
(a) the note that the IndexedDB adapter is shared with Android, (b) the
secure-context check, and (c) Android named as a supported platform.

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
| "create an iOS app (developer subscription purchased)" | Capacitor + WKWebView (WebKit) runs the *same* library; only the shell differs |
| "make it compatible for all platforms" (Epic #21) | Android is a third webview target — Capacitor + Chromium WebView runs the *same* library; see **Android-specific considerations** above |
| "the same code runs in a PWA now and an iOS/Android app later" | framework-agnostic TS library + storage-adapter seam (this doc) |
| "shouldn't need any additional packages in production" (Epic #21) | zero production dependencies — Web-platform APIs only (see [dependency-strategy.md](dependency-strategy.md)) |
| "backend should support … so a front-end can be built on top" | the `BudgetApi` public interface is the contract the front-end implements against |
