# T03 — Local database & repositories

**Depends on:** T02 — **Milestone:** Foundation

## Goal

Durable, indexed, transactional local storage using the browser's **native IndexedDB API** (zero external runtime
dependencies) and the `src/app/` use-case layer skeleton that turns user intentions into domain calls + one transaction.

## Read first

`docs/architecture.md` §2, §4, §5.2, §6, §8.

## Scope

**In:** `src/data/database.ts` (native IndexedDB schema v1 + typed transaction wrapper), repositories, `src/app/` providers (Clock, IdGenerator), use-cases
`completeSetup`, `openMonthsThrough`, `getMonthView` (query), React hook `useMonthView` (built with React 19 `useSyncExternalStore` + change events). Tests with `fake-indexeddb` (devDependency only).
**Out:** UI (T05), backups (T09), tags management (T11 — but `tagIds` fields and the `tags` object store exist now).

## Steps

1. Add `fake-indexeddb` to **`devDependencies`** only (runtime `dependencies` must remain strictly `react` and `react-dom`).
2. `src/data/database.ts`: `SimpleBudgetDatabase` class wrapping native `indexedDB.open('simple-budget', 1)` with object stores and indexes matching `docs/architecture.md` §4 (`settings`, `tags`, `recurringItems`, `entries`, `months`), plus automatic synchronization with the native iOS `Application Support` file bridge (`window.webkit?.messageHandlers?.nativeStorage`) when running inside the native iOS app (`ios/`). Export a factory so tests get a fresh, isolated database each time.
3. Repositories in `src/data/repositories/`: thin functions, typed with domain types. No business decisions.
   Queries needed now: entries by month, sum of entries before a month (index range on `monthKey`), recurring items,
   opened months (latest), settings get/put.
4. `src/app/providers.ts`: `Clock` (`now()`, `today()` using local calendar), `IdGenerator` using
   `crypto.getRandomValues` (not `randomUUID` — must work on plain-HTTP LAN dev). Overridable for tests.
5. Use-cases in `src/app/use-cases/` (each = one `db.transaction('rw', ...)`):
   - `completeSetup({ monthlyIncome, recurringExpenses })` — settings + items (`startMonth` = current month) + open current month.
   - `openMonthsThrough(today)` — the algorithm in §5.2, idempotent, gap-filling.
   - `getMonthView(month)` → domain `monthStatement`.
6. `src/app/hooks/useMonthView.ts` with `useLiveQuery`.
7. Migration policy doc comment at the top of `database.ts`: never edit an existing version; add `version(n+1)` with `upgrade()`.
   Add a test helper that opens a database at an older version to test upgrades (first real use comes later).

## Behaviors to prove

- `finishing setup saves the monthly income and recurring expenses and opens the current month`
- `the month view after setup shows zero carried over, the income, each expense and the current budget`
- `opening months is safe to run many times: recurring lines are never duplicated`
- `the database refuses a second recurring line for the same item in the same month`
- `opening months after two months away fills in both missing months`
- `if a write fails halfway, nothing from that write is saved`
- `entries can be found by month without reading other months` (assert the query uses the `monthKey` index, e.g. via a Dexie `where` on the index)
- `ids work without a secure context` (IdGenerator doesn't call `crypto.randomUUID`)

## Acceptance criteria

- [x] Schema in code equals `docs/architecture.md` §4 exactly.
- [x] Every use-case writes in a single transaction (code review + the failure test).
- [x] No business logic in `src/data/` (only storage); rules live in `src/domain/`.
- [x] `pnpm verify` passes.

## Docs to update

`AGENTS.md` (`src/data/`, `src/app/` rows), `docs/architecture.md` (anything that changed).

## Completion notes

- **Built:**
  - `src/data/database.ts`: Zero-dependency `SimpleBudgetDatabase` wrapping native `indexedDB.open('simple-budget', 1)` with all 5 stores (`settings`, `tags`, `recurringItems`, `entries`, `months`) and indexes (`nameKey` unique, `kind`, `startMonth`, `endMonth`, `monthKey`, `date`, `monthKey_date`, `source`, `recurringItemId`, `recurrenceKey` unique, `tagIds` multiEntry), transactional `transaction()` wrapper with automatic rollback on mid-transaction failure, change listener subscriptions (`subscribe()`), native iOS `Application Support` bridge mirroring (`window.webkit?.messageHandlers?.nativeStorage`), and `openDatabaseAtVersion()` helper for migration tests.
  - `src/data/repositories/index.ts`: Thin typed repository functions (`getSettings`, `putSettings`, `listRecurringItems`, `putRecurringItem`, `getEntriesForMonth` and `getEntriesBeforeMonth` using `IDBKeyRange` on the `monthKey` index, `addLedgerEntry`, `putLedgerEntry`, `listOpenedMonths`, `getLatestOpenedMonth`, `putOpenedMonth`, `listTags`, `putTag`).
  - `src/app/providers.ts`: `Clock` (`createSystemClock`, `createFixedClock`, `createControllableClock`) and `IdGenerator` (`createCryptoIdGenerator` using `crypto.getRandomValues` instead of `crypto.randomUUID` so IDs work over plain-HTTP LAN dev without a secure context, plus `createSequentialIdGenerator`).
  - `src/app/use-cases/index.ts` & `src/app/hooks/useMonthView.ts`: `completeSetup`, idempotent gap-filling `openMonthsThrough`, `getMonthView`, and reactive `useMonthView` / `observeMonthView`.
  - Rule tests in `src/data/database.test.ts`, `src/app/providers.test.ts`, and `src/app/use-cases/use-cases.test.ts` proving all 8 required behaviors plus schema structure, version upgrades, and reactive month view updates.
