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
- **Rule edits (amount, type, schedule, active) never touch posted activities.**
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
    // enumerate every period in (start, period(now)] that is due
    for each period P in missingPeriods(rule, start, period(now)):
      if alreadyPosted(rule.id, P):
        continue                                  // idempotency guard
      create Activity {
        type:   rule.type,                          // income | expense
        amount: rule.amount,
        currency: rule.currency,
        dateTime: dueDateTime(rule, P),             // e.g. 2026-11-01T00:00:00Z
        tags:   [],
        source: "recurring",
        sourceRuleId: rule.id,
        period: P,
        memo:   (optional) "Auto-posted: {rule.name}",
      }
    // after posting all missing periods, advance the high-water mark
    rule.lastPostPeriod = period(now)
    save(rule)
```

### `missingPeriods(rule, startExclusive, endInclusive)`

MVP returns the list of month strings strictly after `startExclusive` up to and
including `endInclusive`, but **only those whose due date (dayOfMonth) has
actually occurred** as of `now`.

```ts
function missingPeriods(
  rule: RecurringRule,
  startExclusive: string, // "YYYY-MM"
  endInclusive: string,   // "YYYY-MM"
  now: Date,
): string[] {
  const out: string[] = [];
  let [y, m] = parseYM(startExclusive); // "YYYY-MM" -> {y, m}
  for (;;) {
    const cur = `${y}-${String(m).padStart(2, "0")}`;
    if (cur > endInclusive) break;
    if (cur !== startExclusive) {
      // due date for this period = the 1st (MVP) of that month
      const due = new Date(Date.UTC(y, m - 1, rule.schedule.dayOfMonth));
      if (due.getTime() <= now.getTime()) out.push(cur);
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
                        amount: 5000, schedule: { cadence: "monthly", dayOfMonth: 1 },
                        active: true, lastPostPeriod: null }
ruleB = RecurringRule { id: "rB", name: "Rent",   type: "expense",
                        amount: 1500, schedule: { cadence: "monthly", dayOfMonth: 1 },
                        active: true, lastPostPeriod: null }
```

### Run 1 — first launch, 2026-11-05

`period(now)` = `"2026-11"`. For each rule, `startExclusive = periodBefore("2026-11")`
= `"2026-10"` (we don't know the rule's history, so we only post the *current*
period that is due).

- **ruleA:** `missingPeriods(ruleA, "2026-10", "2026-11", now)` →
  checks `"2026-11"`: due date 2026-11-01 ≤ now → post.
  → creates `Activity { type: "income", amount: 5000, source: "recurring",
    sourceRuleId: "rA", period: "2026-11", dateTime: "2026-11-01T00:00:00Z" }`.
  `ruleA.lastPostPeriod = "2026-11"`.
- **ruleB:** same → creates `Activity { type: "expense", amount: 1500, source:
  "recurring", sourceRuleId: "rB", period: "2026-11", dateTime: "2026-11-01T00:00:00Z" }`.
  `ruleB.lastPostPeriod = "2026-11"`.

**Available Funds** = 5000 − 1500 = **3500**. ✓

### Run 2 — app re-launched same day, 2026-11-05

`period(now)` = `"2026-11"`. `startExclusive` = `"2026-11"` (lastPostPeriod).
`missingPeriods` returns `[]` (no period in `("2026-11", "2026-11"]`).
→ **No new activities.** Idempotent. ✓

### Run 3 — app opens 2026-12-02

`period(now)` = `"2026-12"`. `startExclusive` = `"2026-11"`.
`missingPeriods(ruleA, "2026-11", "2026-12", now)` → checks `"2026-12"`:
due date 2026-12-01 ≤ now → post.
→ creates `Activity { type: "income", amount: 5000, source: "recurring",
  sourceRuleId: "rA", period: "2026-12", dateTime: "2026-12-01T00:00:00Z" }`.
`ruleA.lastPostPeriod = "2026-12"`. Same for ruleB.

**Available Funds** = (5000 + 5000) − (1500 + 1500) = **7000**. ✓

### Editing a rule

On 2026-11-10 the user changes `ruleB.amount` from 1500 → 1800 (Rent went up).

- The **2026-11 activity** (already posted) is an independent record. The user
  *may* edit it (set amount to 1800) — that is a user edit, not an engine action.
- The **2026-12 activity** (not yet posted) will be posted with `amount: 1800`
  when December arrives, because the engine reads `ruleB.amount` at post-time.
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

## Notes and resolved defaults

- **Resolved MVP default — back-fill on re-enable.** Because the engine only posts
  `(lastPostPeriod, now]` for *active* rules and `lastPostPeriod` is not advanced
  while a rule is disabled, re-enabling a rule back-fills every due period that
  was skipped. Each back-filled period is still idempotency-guarded by
  `(sourceRuleId, period)`, so nothing is double-posted. If we ever want to
  *suppress* back-fill (i.e. treat a disabled period as "forgiven"), that is a
  small change: advance `lastPostPeriod` to `now` when a rule is disabled.
- **Timezone / due-date precision.** MVP treats the due date as midnight UTC on
  `dayOfMonth`. If the user's timezone matters (e.g. a rule due on the 31st of a
  30-day month), that is a future refinement to the period iterator.
- **The engine is pure.** `runRecurringEngine(now)` is a pure function of
  `(rules, activities, now)` — it takes them as arguments and returns the list of
  new activities to insert + the updated rules. This makes it trivially
  unit-testable with no storage adapter.
