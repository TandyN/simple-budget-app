# T12 — Calendar

**Depends on:** T10 — **Milestone:** Full app

## Goal

A correct, beautiful month calendar (real weekdays, leap years, today highlighted) that shows which days had spending,
filters the ledger to a day, and tells you how much you can spend per day for the rest of the month.

## Read first

`src/domain/calendar.ts` (`buildMonthGrid`, `daysLeftInMonth`), `docs/design.md` (layouts).

## Scope

**In:** `MonthCalendar` component, day dots (spending intensity in 3 quiet levels), tap-a-day filter with a clear chip,
"≈ \$X/day left" under the hero for the current month, week-start setting (Sunday/Monday) in Settings, integration with
month navigation from T07.
**Out:** multi-month or year views (follow-up if wanted).

## Steps

1. `MonthCalendar` from `buildMonthGrid(month, weekStartsOn)`; weekday headers localized; out-of-month days muted.
2. Compact: calendar collapsed into a one-week strip under the hero; tap the calendar icon / swipe down to expand to the month.
   Expanded: full month always visible in the left pane.
3. Day cell: number, dot for activity (intensity by spend relative to the month's busiest day), today ringed. Accessible names:
   "Thursday, November 5, 2 expenses, \$134.20 spent".
4. Tap a day → ledger Activity filtered to that day; chip "Nov 5 ×" clears. Tap again to clear.
5. Per-day allowance (current month only): `max(current budget, 0) ÷ daysLeftInMonth(today)`, shown as "≈ \$118/day for the rest of November".
   If the budget is negative, show "Over budget by \$X" instead.
6. Settings → Preferences → Week starts on (Sunday/Monday) persisted in settings.
7. Driver: `calendar` locator, `tapDay(date)`, `setWeekStart('Monday')`, `dailyAllowance` locator.

## Behaviors to prove

- `November 2026 starts on Sunday the 1st and has 30 days`
- `February 2028 shows 29 days`
- `today is highlighted`
- `days with expenses are marked`
- `tapping a day shows only that day's activity, and clearing it shows everything again`
- `the week can start on Monday`
- `the daily allowance divides the current budget by the days left in the month, counting today`
- `when over budget, the app shows how much over instead of a daily allowance`
- `when unfolded, the calendar sits beside the ledger`

## Acceptance criteria

- [ ] Calendar correctness covered by rule tests for every month of 2026–2030 (weekday of the 1st and day counts).
- [ ] `pnpm verify` passes; screenshots at both Duo sizes (collapsed and expanded calendar) reviewed.

## Docs to update

`docs/design.md` (calendar), `docs/testing.md` (driver), `docs/architecture.md` (settings field usage).

## Completion notes

_Filled in by the agent when done._
