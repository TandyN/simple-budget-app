# Budget App — Backend & Core Domain

Tracks what is real in code for the pure financial/validation core (`src/core/`) and backend persistence/API layers. Design-of-record: [project-plan/data-model.md](../../project-plan/data-model.md), [project-plan/activity-model.md](../../project-plan/activity-model.md), [project-plan/recurring-engine.md](../../project-plan/recurring-engine.md), [project-plan/storage.md](../../project-plan/storage.md), and [project-plan/portability.md](../../project-plan/portability.md).

## Pure Core Domain (`src/core/`)

All files under `src/core/` obey the strict portability boundary: zero imports from `src/storage/`, browser DOM globals, or Node-only modules, with `>= 95%` line and branch coverage enforced by `vitest.config.ts`.

### 1. Core Domain Types (`src/core/types.ts`)

- **Recurring rule shapes:** `RuleType` (`"income" | "expense"`), `Schedule` (`{ cadence: "monthly"; dayOfMonth: number }`), `RecurringRule` (with integer-cent `amountCents`, ISO-4217 `currency`, `lastPostPeriod: string | null`, `createdAt`, `updatedAt`, and reserved optional E2EE sync slots `deletedAt?`, `deviceId?`), `NewRule`, and user-editable `RulePatch`.
- **Activity shapes:** `ActivityType` (`"income" | "expense" | "deposit"`), `ActivitySource` (`"manual" | "recurring" | "file-import" | "bank-sync"`), `Activity` (with `tags`, recurring provenance `sourceRuleId?` and `period?`, reserved file-import/bank-sync slots `importBatchId?`, `externalTxnId?`, `sourceAccountId?`, optional `memo?`, `createdAt`, `updatedAt`, and reserved optional E2EE sync slots `deletedAt?`, `deviceId?`), `NewActivity`, and user-editable `ActivityPatch`.
- **Backup & insights shapes:** `BudgetBackup` (`schemaVersion: 1`, `exportedAt`, `rules`, `activities`), Phase 6 `EncryptedBudgetBackup` (`alg: "AES-256-GCM"`, `kdf: "PBKDF2-HMAC-SHA256"`, `iter`, `salt`, `iv`, `ciphertext`), `ActivitySearchFilter` (`since?`, `until?`, `tag?`, `type?`), `ActivityFilter = ActivitySearchFilter`, and `TagSummary` (`tag`, `totalInCents`, `totalOutCents`).

### 2. Runtime & Backup Validation (`src/core/validate.ts`)

- **Integer-cent money & boundary conversions (`toCents`, `fromCents`, `validateAmountCents`):**
  - Stored/core amounts are validated by `validateAmountCents` (`Number.isSafeInteger(amountCents) && amountCents > 0`).
  - Boundary decimal conversion `toCents(decimal)` enforces `Number.isFinite(decimal) && decimal > 0 && decimal <= Number.MAX_SAFE_INTEGER / 100 && Number.isInteger(Math.round(decimal * 100))` and rejects sub-cent fractions (e.g. `12.345`) and values exceeding `Number.MAX_SAFE_INTEGER / 100` (closing the `Number.isInteger(1e23)` overflow gap).
- **Field & entity validators:**
  - `validateIsoUtcTimestamp`: enforces `YYYY-MM-DDTHH:mm:ss(.sss)Z` with real UTC calendar-day validation (rejecting non-leap `Feb 29`, `Apr 31`, etc.).
  - `validatePeriod`: enforces `YYYY-MM` (`01 <= MM <= 12`).
  - `validateCurrency`: enforces 3-letter uppercase ISO-4217 currency codes.
  - Bounded string/array validators: `validateId` (`<= 64` chars), `validateProvenanceId` (`<= 128` chars), `validateRuleName` (`<= 120` chars), `validateTags` (`<= 20` tags, each non-empty `<= 120` chars), `validateMemo` (`<= 1000` chars), and `validateSchedule` (`cadence === "monthly"`, integer `dayOfMonth` in `1..31`).
  - Entity & input/patch validators (`validateRecurringRule`, `validateNewRule`, `validateRulePatch`, `validateActivity`, `validateNewActivity`, `validateActivityPatch`) enforce allowlisted own properties, reject prototype-pollution keys (`__proto__`, `constructor`, `prototype`), and require `sourceRuleId` and `period` when `Activity.source === "recurring"`.
- **Hardened backup payload validator (`validateBackupPayload(rawJson: string): BudgetBackup`):**
  - Checks `new TextEncoder().encode(rawJson).byteLength <= MAX_BACKUP_BYTES` (`10 * 1024 * 1024` bytes = 10 MB) **before** calling `JSON.parse`.
  - Rejects `__proto__`, `constructor`, or `prototype` at any nesting depth via both a `JSON.parse` reviver and `assertNoPrototypePollution`.
  - Enforces `schemaVersion === 1`, valid ISO-8601 UTC `exportedAt`, `rules` and `activities` arrays each bounded to `<= MAX_BACKUP_ARRAY_LENGTH` (`100_000` items), full entity validation, duplicate `id` rejection within `rules` and within `activities`, and single-currency consistency across all records.
- **Phase 6 encrypted backup header validator (`validateEncryptedBackupEnvelope`):**
  - Validates `EncryptedBudgetBackup` headers (`schemaVersion === 1`, `enc.alg === "AES-256-GCM"`, `enc.kdf === "PBKDF2-HMAC-SHA256"`, and integer `enc.iter` in `[600_000, 5_000_000]`) before WebCrypto PBKDF2 key derivation to prevent CWE-400 CPU exhaustion.

### 3. Monthly Recurring Engine (`src/core/engine.ts`)

- **Pure idempotent auto-poster (`runRecurringEngine`):** materializes at most one `Activity` per `(rule.id, period)` pair (guarded by `alreadyPosted`, which excludes soft-deleted `deletedAt !== undefined` records), advances `rule.lastPostPeriod` only when a period actually posted, and never mutates caller arrays/objects.
- **Period & due-instant helpers:** `parseYM`, `periodOfDate`, `periodBefore`, `missingPeriods`, and `dueDateTime` (short-month `Date.UTC` clamping of `schedule.dayOfMonth` with a fixed `12:00:00Z` due instant, OQ-2).

### 4. Derived Available Funds (`src/core/funds.ts`)

- **`computeAvailableFunds(activities): number`:** pure integer-cent derivation `Σ amountCents(type ∈ {income, deposit}) − Σ amountCents(type === "expense")`; zero floating point; returns `0` for an empty list and a **negative** balance when expenses exceed income + deposits. Soft-deleted (`deletedAt !== undefined`) activities are excluded, consistent with the engine's `alreadyPosted` guard.

### 5. Insights — Search, Tag & Period Rollups (`src/core/insights.ts`)

- **`searchActivities(activities, filter): Activity[]`:** intersecting (logical-AND) predicates — `since` (inclusive, `dateTime >= since`), `until` (exclusive, `dateTime < until`), `tag` (`tags.includes(tag)`), `type` (`type === type`); omitted predicates are unbounded so `{}` returns all. Lexicographic `dateTime` comparison is chronological (stored UTC ISO-8601) and timezone-independent.
- **`summarizeByTag(activities): TagSummary[]`:** per-tag `totalInCents` (`income`+`deposit`) / `totalOutCents` (`expense`) rollup in integer cents; a multi-tag activity contributes to **each** tag; untagged activities create no bucket; soft-deleted records excluded; deterministically sorted by `tag` (`localeCompare`).
- **OQ-2 period attribution (`activityPeriod` + `summarizeByPeriod` → `PeriodSummary`):** recurring activities (`source === "recurring"`) are bucketed by their authoritative `Activity.period` (e.g. `"2026-11"`) so timezone offsets / user timestamp edits never misattribute a 1st-of-month item to an adjacent month; non-recurring activities fall back to the UTC month of `dateTime` (`dateTime.slice(0, 7)`). `summarizeByPeriod` returns one rollup per period (chronological) with `totalInCents` / `totalOutCents` and a `summarizeByTag` breakdown per bucket.

## Storage Adapter (`src/storage/`)

The single platform seam over persistence. `src/core/` never touches the store; all reads/writes go through the `StorageAdapter` interface, so the store can be swapped (IndexedDB → durable native, OQ-4) without changing `src/core/` or the front-end.

### 6. `StorageAdapter` contract (`src/storage/adapter.ts`)

- **Types:** `Entity` (`{ rules: RecurringRule; activities: Activity }`), `EntityKey = keyof Entity`, `EntityField<K>`, and `QueryPredicate<K, F>` — a minimal, adapter-agnostic `{ field, eq }` equality predicate (the first generic pins the collection, the second pins the field so `eq` is type-checked against that field).
- **`StorageAdapter` interface:** `open()`, `save(store, value)`, `delete(store, id)`, `query(store, where?)`, `replaceAll({ rules, activities })`, `getMeta<T>(key)`, and `setMeta<T>(key, value)` — exactly the recommended approach in [project-plan/storage.md](../../project-plan/storage.md).
- **Atomic `replaceAll` contract:** both `"rules"` and `"activities"` are cleared + re-put inside a single readwrite transaction (IndexedDB) or one synchronous step (in-memory), so a failed restore leaves both collections in their exact pre-import state.

### 7. `InMemoryAdapter` (`src/storage/memory.ts`)

- A deterministic, zero-dependency `StorageAdapter` for unit/integration testing (no timing, no DOM, no Node globals — Web-platform APIs only).
- `open()` is an idempotent no-op; `save` upserts by the record's `id` and stores an independent shallow copy; `query` returns fresh copies filtered by an optional `{ field, eq }` predicate; `delete` is idempotent (unknown id resolves cleanly); `getMeta`/`setMeta` round-trip values on an independent `"meta"` record (absent key → `null`).
- **`replaceAll` parity:** validates the entire payload before swapping either collection, then swaps both in a single synchronous step — the identical atomic contract as the IndexedDB adapter, so a rejected/invalid restore never clobbers or partially overwrites existing user data.
- Errors are surfaced as **rejected Promises** (the async contract), never synchronous throws, so callers can `await`/`catch` uniformly.

### 8. `IndexedDbAdapter` — T-A + U1 + U2 + U3 (`src/storage/indexeddb.ts`)

- **Origin-isolated database name (OQ-1):** `deriveDbName(basePath)` returns `simple-budget-app` for non-PR base paths and `simple-budget-app-pr-<N>` for `/pr-<N>/` paths; `DB_NAME = deriveDbName(import.meta.env.BASE_URL ?? "/simple-budget-app/")` so PR previews on the shared `tandyn.github.io` origin never open/mutate/bump the production database.
- **`DB_VERSION = 1` + `onupgradeneeded` (T-A schema):** `if (oldVersion < 1)` deterministically provisions the three object stores — `"meta"` (`keyPath: "key"`, seeded with the flat `{ key: "schema", schemaVersion: 1, updatedAt }` bookkeeping record), `"rules"` (`keyPath: "id"`, **no boolean `active` index** because booleans are invalid IndexedDB keys per the W3C spec — active/paused rules are filtered in memory), and `"activities"` (`keyPath: "id"`, with `by_dateTime`, `by_type`, `by_tags` (`multiEntry: true`), and compound `by_rule_period` on `["sourceRuleId", "period"]`).
- **`open()`:** idempotent; opens (and, on first open, creates) the database through the injectable `idbFactory` (defaults to the platform `indexedDB` global; tests inject `fake-indexeddb`). T-A scope: open only — does **not** run the recurring engine or call `persist()`.
- **Basic `getMeta` / `setMeta`:** read/write the `"meta"` store in their own `readonly` / `readwrite` transactions; `getMeta` returns `null` for absent keys. `setMeta` wraps the value as `{ key, value }` so the `keyPath: "key"` is always valid regardless of value type.
- **Atomic `replaceAll` (U1, #249):** clears + re-writes both `"rules"` and `"activities"` inside a **single `readwrite` transaction** spanning `["rules", "activities"]`, resolving only on `tx.oncomplete`. Any mid-transaction write failure aborts the transaction and rolls **both** stores back to their exact pre-import state (no partial write). Terminal handlers (`oncomplete`/`onerror`/`onabort`) are attached **before** work is queued so the promise settles exactly once. `indexedDB.deleteDatabase()` is **never** called on the failure path (`project-plan/storage.md` → "deleteDatabase() forbidden").
- **Defensive `VersionError` handling in `open()` (U2, #252):** if the on-disk database is at a **higher** version than `DB_VERSION` (W3C IndexedDB `VersionError` — e.g. the app was rolled back after a schema bump), `open()` rejects with a typed, **non-destructive** `VersionMismatchError` (a named class, `name === "VersionMismatchError"`, carrying `expectedVersion`) the UI can branch on to render an accessible **"Update required"** banner. It **never** calls `indexedDB.deleteDatabase()` — deleting local-first financial data is irreversible loss with no remote copy to re-sync from. `project-plan/storage.md` → "Defensive non-destructive `VersionError` UI handling (`deleteDatabase()` forbidden)".
- **Best-effort durability API (U3, #253):** `requestPersistenceAfterFirstAction()` calls `navigator.storage?.persist?.()` once, wrapped in `try/catch`, resolving to `false` (never throwing) when unsupported/denied — invoked **after the user's first meaningful write/action, NOT during cold `init()`/`open()`** (Firefox prompts on `persist()`); `getPersisted()` returns the live `navigator.storage?.persisted?.()` status (or `false`) for the Settings readout; `getLastBackupAt()` reads the `"lastBackupAt"` record from the `"meta"` store (read-only — the write is #247's `exportBackup`) and returns the ISO-8601 timestamp (or `null` when never backed up), accepting both the spec's `{ key: "lastBackupAt", timestamp }` shape and the `setMeta` `{ key, value }` envelope. `project-plan/storage.md` → "Storage Durability & WebKit Eviction Mitigation".
- **Remaining stubs (later slice):** `save` / `delete` / `query` are present (satisfying the full `StorageAdapter` contract and type-checking) but reject with a `not implemented` error.
- **Test coverage (`src/storage/indexeddb.test.ts`):** asserts the v1 store set (`meta` / `rules` / `activities`), the exact `activities` index set (`by_dateTime`, `by_type`, `by_tags` `multiEntry`, compound `by_rule_period`), the **absence** of a boolean index on `rules`, and a `getMeta` / `setMeta` round-trip (T-A). U1 (#249) adds two more: an **atomic `replaceAll` rollback** test (a forced mid-transaction `put` failure rejects the call, leaves both stores **100% intact**, and `deleteDatabase` is **not** invoked) and a **`by_rule_period` index-lookup** test (compound `[sourceRuleId, period]` query returns exactly that rule's activity). U2 (#252) adds **defensive `VersionError`** tests: pre-creating the DB at `DB_VERSION + 1` forces a genuine `VersionError`, and `open()` is asserted to **reject with `instanceof VersionMismatchError`** while `indexedDB.deleteDatabase` is **never** called, leaving the higher-version DB intact. U3 (#253) adds **durability API** tests: `requestPersistenceAfterFirstAction()` and `getPersisted()` resolve to `false` (never throw) when `navigator.storage` is absent (stubbed via `Object.defineProperty`, since Vitest's `navigator` is a getter-only accessor), and `getLastBackupAt()` resolves to `null` when no `lastBackupAt` meta exists and to the recorded ISO-8601 timestamp when a `{ key: "lastBackupAt", timestamp }` record (or a `setMeta` `{ key, value }` envelope) is present. All via `fake-indexeddb` (devDependency, zero prod deps).

> `src/budgetApi.ts` (the public `BudgetApi` composition root) is planned next — see [project-plan/build-order.md](../../project-plan/build-order.md) (Phase 3). Atomic `replaceAll` shipped in #249 (U1), defensive non-destructive `VersionError` handling (typed `VersionMismatchError`) shipped in #252 (U2), and the best-effort `persist()` / `persisted()` / `getLastBackupAt()` durability API shipped in #253 (U3).
