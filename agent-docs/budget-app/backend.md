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

### 8. `IndexedDbAdapter` — T-A (`src/storage/indexeddb.ts`)

- **Origin-isolated database name (OQ-1):** `deriveDbName(basePath)` returns `simple-budget-app` for non-PR base paths and `simple-budget-app-pr-<N>` for `/pr-<N>/` paths; `DB_NAME = deriveDbName(import.meta.env.BASE_URL ?? "/simple-budget-app/")` so PR previews on the shared `tandyn.github.io` origin never open/mutate/bump the production database.
- **`DB_VERSION = 1` + `onupgradeneeded` (T-A schema):** `if (oldVersion < 1)` deterministically provisions the three object stores — `"meta"` (`keyPath: "key"`, seeded with the flat `{ key: "schema", schemaVersion: 1, updatedAt }` bookkeeping record), `"rules"` (`keyPath: "id"`, **no boolean `active` index** because booleans are invalid IndexedDB keys per the W3C spec — active/paused rules are filtered in memory), and `"activities"` (`keyPath: "id"`, with `by_dateTime`, `by_type`, `by_tags` (`multiEntry: true`), and compound `by_rule_period` on `["sourceRuleId", "period"]`).
- **`open()`:** idempotent; opens (and, on first open, creates) the database through the injectable `idbFactory` (defaults to the platform `indexedDB` global; tests inject `fake-indexeddb`). T-A scope: open only — does **not** run the recurring engine or call `persist()`.
- **Basic `getMeta` / `setMeta`:** read/write the `"meta"` store in their own `readonly` / `readwrite` transactions; `getMeta` returns `null` for absent keys. `setMeta` wraps the value as `{ key, value }` so the `keyPath: "key"` is always valid regardless of value type.
- **T-A stubs (T-B, #249):** `save` / `delete` / `query` / `replaceAll` are present (satisfying the full `StorageAdapter` contract and type-checking) but reject with a `not implemented in T-A; see #249 (T-B)` error. Atomic `replaceAll` + defensive `VersionError` + `persist()` land in T-B.
- **Test coverage (T-A, `src/storage/indexeddb.test.ts`):** asserts the v1 store set (`meta` / `rules` / `activities`), the exact `activities` index set (`by_dateTime`, `by_type`, `by_tags` `multiEntry`, compound `by_rule_period`), the **absence** of a boolean index on `rules`, and a `getMeta` / `setMeta` round-trip — all via `fake-indexeddb` (devDependency, zero prod deps).

> `src/budgetApi.ts` (the public `BudgetApi` composition root) is planned next — see [project-plan/build-order.md](../../project-plan/build-order.md) (Phase 3). T-B (`replaceAll` / `VersionError` / `persist()`) is ticket #249.
