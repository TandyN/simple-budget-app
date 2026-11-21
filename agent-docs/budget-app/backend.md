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
