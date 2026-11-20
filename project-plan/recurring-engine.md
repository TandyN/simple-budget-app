# Recurring-transaction engine

The engine answers one question on every state change: **"for each active rule,
which periods have come due but not yet been posted?"** and posts exactly one
`Activity` per missing period.

Three hard requirements drive the design (from the user's ask + spike #6):

1. **No double-posting** (idempotency) — running the engine twice must not create
   two activities for the same rule + period.
2. **Change-without-losing-history** — editing/disabling a rule changes only
   *future* periods; already-posted activities are independent and preserved.
3. **MVP: monthly, 1st of month** — but the period iterator must be the *only*
   thing that changes when we add weekly / bi-weekly / custom cadences later.

## Core invariants

- An auto-posted `Activity` carries **`source: "recurring"`, `sourceRuleId`, and
  `period`** (the period string it was posted for, e.g. `"2026-11"`). This triple
  is the **idempotency key**: the engine checks for an existing activity with the
  same `(sourceRuleId, period)` before posting.
- **`RecurringRule.lastPostPeriod`** is the high-water mark: the most recent
  period already posted for that rule. The engine posts every period in the open
  interval `(lastPostPeriod, currentPeriod]`.
- **Rule edits (amountCents, type, schedule, active) never touch posted activities.**
  A posted activity is a self-contained record; the rule is its *origin*, not its
  *owner*.

## The algorithm (MVP: monthly)

```
period(now)        = "YYYY-MM" of the current date            // e.g. "2026-11"
periodOf(d, rule)  = "YYYY-MM" of the period containing the
                     rule's due-date for month d               // MVP: dayOfMonth=1

runRecurringEngine(now):
  for each rule in rules where rule.active == true:
    start = rule.lastPostPeriod ?? periodBefore(period(now))
    // enumerate every period in (start, period(now)] whose due instant has passed (dueAt <= now)
    duePeriods = missingPeriods(rule, start, period(now), now)
    for each period P in duePeriods:
      if alreadyPosted(rule.id, P):
        continue                                  // idempotency guard
      create Activity {
        type:   rule.type,                          // income | expense
        amountCents: rule.amountCents,
        currency: rule.currency,
        dateTime: dueDateTime(rule, P),             // e.g. 2026-11-01T12:00:00Z (fixed noon UTC; OQ-2)
        tags:   [],
        source: "recurring",
        sourceRuleId: rule.id,
        period: P,
        memo:   (optional) "Auto-posted: {rule.name}",
      }
    // advance the high-water mark only to the last period actually due/returned
    // (never unconditionally to period(now), or an early-month run would skip the current period)
    if duePeriods.length > 0:
      rule.lastPostPeriod = duePeriods[duePeriods.length - 1]
      save(rule)
```

### `missingPeriods(rule, startExclusive, endInclusive, now)` & `dueDateTime(rule, period)`

MVP returns the list of month strings strictly after `startExclusive` up to and
including `endInclusive`, but **only those whose clamped due date (`dayOfMonth`)
has actually occurred** as of `now`.

#### Short-Month `Date.UTC` Clamping

In ECMAScript, `Date.UTC(y, m - 1, day)` silently overflows out-of-range days into
the following month—for example, `Date.UTC(2026, 1, 31)` (February 31, 2026)
overflows to `2026-03-03T00:00:00.000Z` (March 3). Without clamping, a rule
configured with `dayOfMonth: 29..31` would evaluate against the wrong timestamp
and stamp an activity for period `"2026-02"` with a March `dateTime`.

Both `dueDateTime(rule, period)` and `missingPeriods(rule, startExclusive, endInclusive, now)`
MUST clamp `rule.schedule.dayOfMonth` to the actual number of days in month `m`
(`new Date(Date.UTC(y, m, 0)).getUTCDate()`), and anchor the due instant at fixed
**`12:00:00Z`** (noon UTC — OQ-2 adopted default, see
[Notes and resolved defaults](#notes-and-resolved-defaults)), guaranteeing that
rules scheduled for days 29–31 post on the last valid day of short months (e.g.,
Feb 28 in non-leap years, Feb 29 in leap years, and Apr/Jun/Sep/Nov 30) and
render on the expected local calendar day for UTC−12 through UTC+11:

```ts
function dueDateTime(rule: RecurringRule, period: string): string {
  const [y, m] = parseYM(period); // "YYYY-MM" -> [y, m] where m is 1..12
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const effectiveDay = Math.min(rule.schedule.dayOfMonth, daysInMonth);
  const dueAt = new Date(Date.UTC(y, m - 1, effectiveDay, 12, 0, 0));
  return dueAt.toISOString(); // e.g. "2026-11-01T12:00:00.000Z"
}

function missingPeriods(
  rule: RecurringRule,
  startExclusive: string, // "YYYY-MM"
  endInclusive: string,   // "YYYY-MM"
  now: Date,
): string[] {
  const out: string[] = [];
  let [y, m] = parseYM(startExclusive); // "YYYY-MM" -> [y, m]
  for (;;) {
    const cur = `${y}-${String(m).padStart(2, "0")}`;
    if (cur > endInclusive) break;
    if (cur !== startExclusive) {
      // Clamp dayOfMonth (1..31) to the actual number of days in month m
      // so short months (e.g. Feb 28/29, Apr 30) never overflow Date.UTC into month m + 1.
      // Anchor at 12:00:00Z (OQ-2) so UTC-12..UTC+11 users see the intended local calendar day.
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const effectiveDay = Math.min(rule.schedule.dayOfMonth, daysInMonth);
      const dueAt = new Date(Date.UTC(y, m - 1, effectiveDay, 12, 0, 0));
      if (dueAt.getTime() <= now.getTime()) out.push(cur);
    }
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return out;
}
```

> **Generalization note:** for weekly / bi-weekly cadences the *shape* of this
> function changes (anchor date + N-weeks step) but the **call site and the
> idempotency key `(sourceRuleId, period)` do not.** The `period` string simply
> becomes a cycle identifier (e.g. `"2026-W45"`). This is why the period
> iterator is the only swappable piece.

### `alreadyPosted(ruleId, period)` — the idempotency guard

```ts
function alreadyPosted(activities: Activity[], ruleId: string, period: string): boolean {
  return activities.some(a =>
    a.source === "recurring" &&
    a.sourceRuleId === ruleId &&
    a.period === period
  );
}
```

This is the **primary** guard. The `lastPostPeriod` high-water mark is a
**secondary, optimization-only** guard (it lets us skip whole ranges we already
handled). If `lastPostPeriod` is ever lost or stale, the `alreadyPosted` check
still prevents double-posting. **Idempotency does not depend on the high-water
mark.**

### When the engine runs

- **On app start** (after `open()`), and
- **After any state change** that could make a period due: creating a rule,
  enabling a rule, or the passage of time (the PWA can call the engine on a
  timer / on focus; iOS and Android can call it on app launch — the engine is
  idempotent, so calling it on open is always safe).

Running it more often than necessary is safe — the idempotency guard makes it a
no-op for periods already posted.

## State machine (per rule)

```
        ┌──────────────────────────────────────────────────────────┐
        │                                                          │
   ┌────▼─────┐   create    ┌──────────────┐  active=true  ┌──────────────┐
   │  (none)  │────────────►│  INACTIVE    │──────────────►│   ACTIVE     │
   └──────────┘             └──────────────┘◄──────────────└──────────────┘
        ▲                        ▲  active=false            │
        │  delete                └───────────────────────────┘
        │                                          post missing periods
        └───────────────────────────────────────────────┘
```

- **INACTIVE** (`active: false`): the engine never posts for this rule. Existing
  posted activities remain in the log and stay editable.
- **ACTIVE** (`active: true`): the engine posts for every missing due period each
  time it runs.
- Toggling `active` **never** deletes or modifies posted activities. It only
  changes whether *future* periods are posted.

## Worked example (MVP, monthly, 1st of month)

Setup: it is now **2026-11-05**. The user creates two rules:

```ts
ruleA = RecurringRule { id: "rA", name: "Salary", type: "income",
                        amountCents: 500000, schedule: { cadence: "monthly", dayOfMonth: 1 },
                        active: true, lastPostPeriod: null }
ruleB = RecurringRule { id: "rB", name: "Rent",   type: "expense",
                        amountCents: 150000, schedule: { cadence: "monthly", dayOfMonth: 1 },
                        active: true, lastPostPeriod: null }
```

### Run 1 — first launch, 2026-11-05

`period(now)` = `"2026-11"`. For each rule, `startExclusive = periodBefore("2026-11")`
= `"2026-10"` (we don't know the rule's history, so we only post the *current*
period that is due).

- **ruleA:** `missingPeriods(ruleA, "2026-10", "2026-11", now)` →
  checks `"2026-11"`: due date `2026-11-01T12:00:00Z` ≤ now → post.
  → creates `Activity { type: "income", amountCents: 500000, source: "recurring",
    sourceRuleId: "rA", period: "2026-11", dateTime: "2026-11-01T12:00:00Z" }`.
  `ruleA.lastPostPeriod = "2026-11"`.
- **ruleB:** same → creates `Activity { type: "expense", amountCents: 150000, source:
  "recurring", sourceRuleId: "rB", period: "2026-11", dateTime: "2026-11-01T12:00:00Z" }`.
  `ruleB.lastPostPeriod = "2026-11"`.

**Available Funds** = 500000 − 150000 = **350000** cents. ✓

### Run 2 — app re-launched same day, 2026-11-05

`period(now)` = `"2026-11"`. `startExclusive` = `"2026-11"` (lastPostPeriod).
`missingPeriods` returns `[]` (no period in `("2026-11", "2026-11"]`).
→ **No new activities.** Idempotent. ✓

### Run 3 — app opens 2026-12-02

`period(now)` = `"2026-12"`. `startExclusive` = `"2026-11"`.
`missingPeriods(ruleA, "2026-11", "2026-12", now)` → checks `"2026-12"`:
due date `2026-12-01T12:00:00Z` ≤ now → post.
→ creates `Activity { type: "income", amountCents: 500000, source: "recurring",
  sourceRuleId: "rA", period: "2026-12", dateTime: "2026-12-01T12:00:00Z" }`.
`ruleA.lastPostPeriod = "2026-12"`. Same for ruleB.

**Available Funds** = (500000 + 500000) − (150000 + 150000) = **700000** cents. ✓

### Editing a rule

On 2026-11-10 the user changes `ruleB.amountCents` from 150000 → 180000 (Rent went up).

- The **2026-11 activity** (already posted) is an independent record. The user
  *may* edit it (set amountCents to 180000) — that is a user edit, not an engine action.
- The **2026-12 activity** (not yet posted) will be posted with `amountCents: 180000`
  when December arrives, because the engine reads `ruleB.amountCents` at post-time.
- **No history is lost.** The 2026-11 record still exists and is editable.

### Disabling a rule

On 2026-11-10 the user sets `ruleA.active = false`.

- The 2026-11 income activity **remains** in the log and is still editable.
- While disabled, the engine **skips** ruleA (it only iterates *active* rules),
  so no income is posted for 2026-12, 2026-01, …
- `ruleA.lastPostPeriod` stays `"2026-11"` — it is only advanced *when the
  engine posts for that rule*, so the skipped periods remain "unposted".
- If the user re-enables ruleA on, say, 2027-02-03, the engine sees
  `(lastPostPeriod, now]` = `("2026-11", "2027-02"]` and **back-fills** every
  due period in that range (2026-12, 2027-01, 2027-02) — one activity each,
  idempotency-guarded. This is the intended "resume where you left off" behavior:
  a rule that was paused does not silently drop its obligations, and no period is
  ever double-posted because each back-filled period is checked by
  `(sourceRuleId, period)` before insert.

### Deleting a rule

Deleting `ruleB` removes the **rule**, but **does not delete** its already-posted
activities. The activities are independent records; they keep their
`sourceRuleId` (a dangling reference is fine — the engine never looks up the rule
by `sourceRuleId` for an already-posted activity). This is the
**"change-without-losing-history"** guarantee made explicit.

### Deleting a recurring-generated activity

When the user deletes an auto-posted `Activity` (`source: "recurring"`, e.g. the
`"2026-11"` Rent posting), `adapter.delete("activities", id)` removes that
record from the activity log and Available Funds immediately reflects the removal.

- **Never re-posted in the MVP:** Because `rule.lastPostPeriod` already advanced
  to `"2026-11"` when the period was originally posted, subsequent runs of
  `missingPeriods(rule, rule.lastPostPeriod, period(now), now)` only enumerate
  periods strictly after `rule.lastPostPeriod` (starting from
  `nextMonth(rule.lastPostPeriod)`, i.e. `"2026-12"` onward). The engine
  therefore never re-evaluates `"2026-11"` and will **not** resurrect the
  user-deleted activity, even though the `Activity` record is no longer present
  for `alreadyPosted` to match (see [activity-model.md → Editing any activity](activity-model.md#editing-any-activity)).
- **Post-MVP historical re-evaluation seam:** If a post-MVP feature ever
  introduces historical range re-evaluation prior to `rule.lastPostPeriod` (for
  example, when back-dating a rule's `anchorDate` or resetting `lastPostPeriod`),
  adding an optional `skippedPeriods?: string[]` tombstone list on
  `RecurringRule` preserves user deletions across arbitrary historical re-walks.

## Notes and resolved defaults

- **Resolved MVP default — back-fill on re-enable.** Because the engine only posts
  `(lastPostPeriod, now]` for *active* rules and `lastPostPeriod` is not advanced
  while a rule is disabled, re-enabling a rule back-fills every due period that
  was skipped. Each back-filled period is still idempotency-guarded by
  `(sourceRuleId, period)`, so nothing is double-posted. If we ever want to
  *suppress* back-fill (i.e. treat a disabled period as "forgiven"), that is a
  small change: advance `lastPostPeriod` to `now` when a rule is disabled.
- **Timezone / due-date precision & short-month clamping (OQ-2 adopted default).**
  MVP anchors every recurring due instant at fixed **`12:00:00Z`** (noon UTC) on
  the clamped `effectiveDay = Math.min(rule.schedule.dayOfMonth, daysInMonth)`
  (so a rule due on the 31st posts on `2026-02-28T12:00:00.000Z` in a non-leap
  February and `2026-04-30T12:00:00.000Z` in April, never overflowing into the
  next month).
  - **Why `12:00:00Z` instead of `00:00:00Z`:** Midnight UTC (`00:00:00Z`)
    renders as the 30th/31st of the *previous* month for all UTC− users (the
    Americas) and causes local-month `[since, until)` queries to misattribute
    1st-of-month recurring items to the previous month. Noon UTC (`12:00:00Z`)
    renders on the intended local calendar day for **UTC−12 through UTC+11**.
  - **Period rollup rule:** Period rollups (monthly/period summaries) MUST
    compute recurring-activity membership from `Activity.period` where
    `source === "recurring"` (falling back to `dateTime` for non-recurring
    activities), preventing timezone-boundary misattribution (see
    [activity-model.md → Insights / search](activity-model.md#insights--search)).
  - **Accepted residual (UTC+12..+14):** For users in UTC+12 to UTC+14 (e.g.,
    New Zealand, Fiji, Kiribati), `12:00:00Z` renders as `00:00–02:00` of the
    following local day. This is an accepted MVP residual; if exact
    local-midnight precision is ever needed, passing an explicit IANA timezone
    into `dueDateTime` is a localized refinement.
- **The engine is pure.** `runRecurringEngine(now)` is a pure function of
  `(rules, activities, now)` — it takes them as arguments and returns the list of
  new activities to insert + the updated rules. This makes it trivially
  unit-testable with no storage adapter.
