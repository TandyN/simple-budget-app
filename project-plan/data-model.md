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
  reserves the slots, it does not design the OAuth mechanics.
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
  Number.isInteger(Math.round(decimal * 100))` on any **decimal-unit input** so the
  derived `amountCents` is a whole cent (no sub-cent fractions, no `NaN`/`Infinity`).
  The invariant is on the **boundary input**, not on the stored field — the stored
  field is `amountCents` itself, already an integer by construction.

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
