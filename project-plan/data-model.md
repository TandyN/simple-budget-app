# Data model

**The load-bearing decision (spike #6):** keep the **recurring rule** separate
from the **activity records it generates**. The rule is the user-editable
"what repeats"; the activity is a concrete, independent, editable record of
"what actually happened". **Available Funds is always *derived* from the
activity log — never stored.**

This separation is what makes the whole product work:

- **Edit / disable a rule → only affects *future* periods.** Already-posted
  activities are independent records and are preserved.
- **Every activity is editable** (manual and auto-generated alike).
- **Available Funds** stays consistent because it is recomputed from the
  activity log after any edit, never stored as a stale number.

## The two core entities

### 1. `RecurringRule` — the user-editable "what repeats"

```ts
type RuleType = "income" | "expense";

interface RecurringRule {
  id: string;          // e.g. uuid v4, generated client-side
  name: string;        // user-facing label, e.g. "Rent", "Salary"
  type: RuleType;      // income | expense (deposit is an Activity-level type, see below)
  amountCents: number;  // positive integer, in minor units (cents). Canonical stored shape — all arithmetic is integer-domain.
  currency: string;    // ISO-4217, default "USD"; stored so it can vary per rule
  schedule: Schedule;  // see below — MVP is monthly, day 1
  active: boolean;     // false = paused/disabled; engine skips it
  lastPostPeriod: string | null; // last period already auto-posted (e.g. "2026-11"); null = never posted (always present, null is the "never" sentinel)
  createdAt: string;   // ISO-8601 timestamp
  updatedAt: string;   // ISO-8601 timestamp
}

interface Schedule {
  cadence: "monthly";  // MVP only. future: "bi-weekly" | "weekly" | "custom"
  dayOfMonth: number;  // 1..31; MVP default 1
  // Future (out of scope for MVP) — shape is reserved so the iterator can
  // generalize without a breaking change:
  // anchorDate?: string;   // ISO date anchoring weekly/bi-weekly cycles
  // customDates?: string[];// explicit ISO dates for "custom" cadence
}
```

- **`lastPostPeriod`** is the engine's memory of "what have we already posted".
  See [recurring-engine.md](recurring-engine.md) for the full algorithm.
- A **disabled** rule (`active: false`) is never re-activated by the engine, but
  any activities it already produced remain in the log and stay editable.
- **`deposit` is not a `RuleType`.** Recurring rules are income or expense; a
  *deposit* is a manual Activity type (see [resolved MVP default B](portability.md#resolved-mvp-defaults)).

### 2. `Activity` — a concrete, independent, always-editable record

```ts
type ActivityType = "income" | "expense" | "deposit";
type ActivitySource = "manual" | "recurring" | "bank-sync";

interface Activity {
  id: string;            // uuid v4
  type: ActivityType;    // income | expense | deposit
  amountCents: number;   // positive integer, in minor units (cents). Canonical stored shape — all arithmetic is integer-domain.
  currency: string;      // ISO-4217
  dateTime: string;      // ISO-8601; defaults to "now" at creation, always editable
  tags: string[];        // free-form manual tags, e.g. ["housing","rent"]
  source: ActivitySource;// manual | recurring | bank-sync
  sourceRuleId?: string; // set when source === "recurring"; id of the RecurringRule
  period?: string;       // set when source === "recurring"; the period it was posted for (e.g. "2026-11")
  // Bank-sync slots — RESERVED for a future bank-sync project. NOT used by the
  // MVP, so introducing them requires no data migration of existing records.
  externalTxnId?: string;// stable external transaction id from the bank feed; the re-sync dedupe key
  sourceAccountId?: string; // the linked bank account this txn came from
  memo?: string;         // optional free-text note
  createdAt: string;     // ISO-8601; when the record was created
  updatedAt: string;     // ISO-8601; when last edited
}
```

- **`source` + `sourceRuleId` + `period`** let us answer "was this auto-posted
  by which rule, for which period?" — which is what makes re-posting idempotent
  (see [recurring-engine.md](recurring-engine.md)).
- **`source: "bank-sync"` + `externalTxnId` + `sourceAccountId`** are
  **reserved** for a future bank-sync project (bank-OAuth / account feed). They
  are **not used by the MVP**, and because they are already in the shape the
  bank-sync project needs no data migration — it simply starts populating them.
  `externalTxnId` is the stable id a bank assigns to a transaction (the re-sync
  dedupe key); `sourceAccountId` names the linked bank account. The bank-OAuth
  *flow* + token storage is a **future platform-layer project** — this model only
  reserves the slots, it does not design the OAuth mechanics. **Feasibility
  (affirmed):** bank-OAuth account-linking is **explicitly feasible as that later
  platform-layer project** — the **RFC 8252** OAuth 2.0 for Native Apps (local-app
  loopback) pattern is well-suited to a Web/WebView budget app, and adopting it
  requires no change to this data model, only the platform layer that populates the
  reserved slots. The reserved slots above are therefore a **deliberate go**, not an
  open question.
- **Every field is editable** by the user after creation — including the
  `type`, `amountCents`, `dateTime`, and `tags` of an auto-generated record. Editing
  an auto-generated Activity does **not** change the source rule.
- **Money is integer cents, always.** The **stored** shape of money is
  `amountCents: number`, a **positive integer in the currency's minor unit
  (cents)**. All arithmetic — Available Funds, tag rollups, engine posting — is
  **integer-domain**, so there is no IEEE-754 float drift to round away.
- **Decimal units are a boundary-only concern.** `toCents(decimal)` /
  `fromCents(cents)` are **input/output boundary conversions only**: the UI (and
  the recurring engine, which copies a rule's cents onto a posted activity) may
  present or accept a human decimal unit, but it is converted to/from `amountCents`
  at the boundary. The value that is *stored* and that *flows through the core*
  is always `amountCents`.
- **Input guard (not a stored-value strategy).** Runtime validation
  (`src/core/validate.ts`) MUST assert `Number.isFinite(decimal) && decimal > 0 &&
  decimal <= Number.MAX_SAFE_INTEGER / 100 &&
  Number.isInteger(Math.round(decimal * 100))` on any **decimal-unit input** so the
  derived `amountCents` is a whole cent (no sub-cent fractions, no `NaN`/`Infinity`)
  **and** stays within the safe-integer range (no `Number.MAX_SAFE_INTEGER`
  overflow). The explicit **upper bound** `decimal <= Number.MAX_SAFE_INTEGER / 100`
  closes the otherwise-unbounded gap: in JS `Number.isInteger(1e23) === true`, so
  `1e21`/`1e23` would pass the cent-whole check alone and produce an absurd
  `amountCents` that overflows a 64-bit integer. The invariant is on the **boundary
  input**, not on the stored field — the stored field is `amountCents` itself,
  already an integer by construction.

## Relationships

```
RecurringRule 1 ──── * Activity
     (id)              (sourceRuleId)   [only when source === "recurring"]
```

- An Activity **may** point back at a RecurringRule (when `source ===
  "recurring"`), but a manual Activity has no `sourceRuleId`.
- There is **no** foreign-key constraint in the browser store; the relationship
  is enforced by the engine + the CRUD layer. Deleting a rule does not delete its
  already-posted activities (history is preserved — see
  [recurring-engine.md](recurring-engine.md#deleting-a-rule)).

## Derived values (never stored)

```
Available Funds = sum(amountCents of Activities where type ∈ {income, deposit})
                − sum(amountCents of Activities where type === expense)
```

- Computed **on demand** from the activity log.
- All arithmetic is **integer-domain** (`amountCents`), so there is no float
  drift to round away.
- Because it is derived, any edit to any Activity is automatically reflected —
  no cache to invalidate, no stale number to reconcile.
- **`deposit`** counts as *money in* (treated like income in the Available Funds
  sum). See the [resolved MVP default on deposit](portability.md#resolved-mvp-defaults).

```ts
function computeAvailableFunds(activities: Activity[]): number {
  let availableCents = 0;
  for (const a of activities) {
    if (a.type === "expense") availableCents -= a.amountCents;
    else availableCents += a.amountCents; // income or deposit
  }
  return availableCents; // integer cents (minor units)
}
```

## Editability matrix

| Field | Editable by user? | Notes |
| ----- | ----------------- | ----- |
| `RecurringRule.name` | yes | |
| `RecurringRule.amountCents` | yes | Affects **future** periods only |
| `RecurringRule.type` | yes | Affects **future** periods only |
| `RecurringRule.schedule` | yes | Affects **future** periods only |
| `RecurringRule.active` | yes | Toggles whether the engine posts new periods |
| `RecurringRule.lastPostPeriod` | no | Internal engine state; not user-editable |
| `Activity.type` | yes | Manual **or** recurring |
| `Activity.amountCents` | yes | Manual **or** recurring |
| `Activity.dateTime` | yes | Defaults to "now" at creation, always changeable |
| `Activity.tags` | yes | Free-form, any time |
| `Activity.memo` | yes | |
| `Activity.source` | no | Determined at creation; not user-set |
| `Activity.sourceRuleId` | no | Determined at creation; not user-set |
| `Activity.period` | no | Determined at creation; not user-set |
| `Activity.createdAt` / `updatedAt` | no | System-managed |

## Mapping the user's ask → model

| User's ask | Model answer |
| ---------- | ------------ |
| Monthly income (MVP) | `RecurringRule { type: "income", schedule: { cadence: "monthly", dayOfMonth: 1 } }` |
| Recurring expenses (MVP, 1st of month) | `RecurringRule { type: "expense", schedule: { cadence: "monthly", dayOfMonth: 1 } }` |
| Manual expenses | `Activity { type: "expense", source: "manual" }` |
| Manual deposits | `Activity { type: "deposit", source: "manual" }` |
| "All activity is editable" | Every `Activity` field (user-settable ones) is editable, manual or recurring |
| "Change recurring income/expense whenever I want" | Edit `RecurringRule`; only future periods change |
| "Without losing history" | Already-posted `Activity` records are independent and preserved |
| "Tag every activity" | `Activity.tags: string[]` |
| "Timestamp defaults to now, but changeable" | `Activity.dateTime` |
| "Available Funds" | Derived: income − expense (see above) |
| "Bi-weekly / weekly + custom dates (future)" | `Schedule.cadence` extended; `anchorDate` / `customDates` reserved |

## Versioned `BudgetBackup` Schema & Hardened Import Validation

User-initiated JSON backup export (`budget.exportBackup()`) and restore (`budget.importBackup(rawJson)`) use an explicit, versioned envelope so backups remain forward-migrable and untrusted JSON files are strictly validated in `src/core/validate.ts` before touching storage:

```ts
interface BudgetBackup {
  schemaVersion: 1;
  exportedAt: string; // ISO-8601 UTC instant
  rules: RecurringRule[];
  activities: Activity[];
}
```

### Hardened Import Validation (`validateBackupPayload(rawJson: string): BudgetBackup`)

Because a user-selected backup file is untrusted external input, `validateBackupPayload(rawJson: string): BudgetBackup` in `src/core/validate.ts` enforces strict defense-in-depth checks **before** `IndexedDbAdapter.replaceAll` is ever called (see [storage.md](storage.md)):

- **Size bound (10 MB ceiling):** Reject `rawJson` exceeding `10 * 1024 * 1024` bytes (10 MB, measured via `new TextEncoder().encode(rawJson).byteLength`) before calling `JSON.parse`, preventing main-thread memory exhaustion or denial-of-service on mobile WebViews.
- **Prototype-pollution guard:** Use a `JSON.parse` reviver and/or recursive `Object.keys` / `Object.getOwnPropertyNames` check that immediately rejects any object containing `__proto__`, `constructor`, or `prototype` as an own property, and construct clean plain objects with only allowlisted domain properties.
- **Strict schema & type checks:**
  - Verify top-level envelope is a non-null plain object with `schemaVersion === 1`, a valid ISO-8601 UTC `exportedAt` timestamp, and arrays `rules` and `activities` (each bounded to `<= 100_000` items).
  - Run the full `RecurringRule` and `Activity` domain validators on every element:
    - **Money invariants:** `Number.isSafeInteger(amountCents) && amountCents > 0` (strictly positive safe integers in minor units).
    - **Enum & schedule invariants:** Valid `RuleType` (`"income" | "expense"`), `ActivityType` (`"income" | "expense" | "deposit"`), `ActivitySource` (`"manual" | "recurring" | "bank-sync"`), `schedule.cadence === "monthly"`, and integer `schedule.dayOfMonth` in `1..31`.
    - **Date & period invariants:** Valid `YYYY-MM` format (`1 <= month <= 12`) for `lastPostPeriod` (when non-null) and `Activity.period` (when `source === "recurring"`), and valid ISO-8601 UTC instants (`YYYY-MM-DDTHH:mm:ss(.sss)Z`) for `dateTime`, `createdAt`, and `updatedAt`.
    - **Bounded string & array lengths:** Non-empty `id` (`<= 64` chars), rule `name` / `label` and each `tag` bounded to `<= 120` chars, optional `memo` bounded to `<= 1000` chars, and `tags.length <= 20`.
    - **Referential & uniqueness invariants:** Reject duplicate `id`s within `rules` or within `activities`; require `sourceRuleId` and `period` when `source === "recurring"`.
    - **Single-currency consistency:** Enforce a valid 3-letter uppercase ISO-4217 `currency` code (e.g. `"USD"`) and verify single-currency consistency across all rules and activities in the imported budget so `computeAvailableFunds` and `summarizeByTag` never sum mixed currencies.

Only after `validateBackupPayload(rawJson)` returns a clean, fully validated `BudgetBackup` does `budget.importBackup(rawJson)` invoke `adapter.replaceAll({ rules: backup.rules, activities: backup.activities })` inside a single atomic IndexedDB `readwrite` transaction (see [storage.md](storage.md)).

## Post-MVP Extensibility & Growth Seams

The v1 data model (`RecurringRule`, `Activity`), `BudgetBackup` (`schemaVersion: 1`), and `StorageAdapter` (`DB_VERSION = 1` in [storage.md](storage.md)) are intentionally structured so the seven most sought-after modern budget-app capabilities layer onto v2+ via additive `onupgradeneeded` migrations and optional fields—**without breaking or rewriting v1 records**:

1. **Category Budgets / Envelopes (YNAB / Monarch style):**
   - Add a new `"budgetTargets"` object store in `DB_VERSION = 2`:
     ```ts
     interface BudgetTarget {
       id: string;
       tag: string;                // matches Activity.tags entry (e.g. "groceries")
       monthlyTargetCents: number; // positive integer cents
       rollover: boolean;          // whether unspent cents carry into the next period
     }
     ```
   - Joins purely against `summarizeByTag(await searchActivities({ since, until }))` (see [activity-model.md](activity-model.md)) to compute funded, spent, and remaining envelope balances in integer cents.
2. **Multi-Period Trends, Cash-Flow & Forecasting (Copilot / Monarch style):**
   - Add a pure `summarizeByPeriod(activities: Activity[], granularity: "month" | "quarter" | "year")` function in `src/core/insights.ts` operating over activities queried via the `by_dateTime` index.
   - Renders as zero-dependency inline SVG bar/area charts in the unfolded right-hand companion pane (`>= 700px`, see [frontend.md](frontend.md)).
3. **Flexible Recurring Cadences (`weekly`, `bi-weekly`, `semi-monthly`, `quarterly`, `yearly`):**
   - Extend `Schedule.cadence` and populate the already-reserved `anchorDate: string` field inside `missingPeriods(rule, now)` (see [recurring-engine.md](recurring-engine.md)).
   - The `(sourceRuleId, period)` idempotency key and the compound `by_rule_period` index remain completely unchanged—`period` simply generalizes from `"2026-11"` to ISO week `"2026-W14"`, date `"2026-03-15"`, quarter `"2026-Q1"`, or year `"2026"`.
4. **Split Transactions:**
   - Add an optional `splits?: Array<{ amountCents: number; tags: string[]; memo?: string }>` field on `Activity` with the invariant `sum(splits.amountCents) === activity.amountCents`.
   - `computeAvailableFunds` continues reading `activity.amountCents` unchanged, while `summarizeByTag` and `searchActivities` inspect `activity.splits` when present.
5. **Multi-Account & Net-Worth Tracking / Transfers:**
   - Add a new `"accounts"` object store (`Account { id, name, type: "checking" | "savings" | "credit" | "investment", currency }`) and populate the already-reserved `Activity.sourceAccountId` field.
   - Add an optional `transferPeerId?: string` on `Activity` linking paired inter-account transfer records (net-zero across total Available Funds, while tracked individually per account).
6. **Bank Sync / OAuth Reconciliation (Plaid / SimpleFin + RFC 8252):**
   - Populate the already-reserved `source: "bank-sync"`, `externalTxnId`, and `sourceAccountId` fields on `Activity`, plus optional `pending?: boolean` and `reconciledRuleId?: string` to match imported bank transactions against auto-posted recurring activities without double-counting.
7. **Multi-Currency:**
   - MVP validation enforces single-currency consistency per budget while storing `currency` (ISO-4217) on every `RecurringRule` and `Activity`.
   - Post-MVP multi-currency support groups balances and tag rollups by `currency` (using `Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits` for 0-, 2-, and 3-decimal minor-unit scaling) and optionally applies user-pinned or cached exchange rates at the reporting layer.
