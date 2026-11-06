# T07 — Monthly rollover

**Depends on:** T06 — **Milestone:** MVP

## Goal

When a new month starts, the app carries the leftover (or overspent) budget forward and adds the recurring income
and expenses again — correctly across year boundaries, leap years, missed months, and while the app stays open.

## Read first

`docs/architecture.md` §5.2, `src/domain/calendar.ts`, `src/domain/ledger.ts`, `docs/testing.md` (clock control).

## Scope

**In:** triggering `openMonthsThrough` on startup / when the app becomes visible / at local midnight; _Carried over from {month}_
line with sign/color; month navigation (previous/next) to view past months; driver `travelTo(date)`, `goToMonth(label)`.
**Out:** calendar grid (T12), viewing future months (not planned).

## Steps

1. App bootstrap runs `openMonthsThrough(today)` before rendering the month screen (show nothing/skeleton briefly, never a wrong number).
2. Listen for `visibilitychange` → visible and `pageshow`; schedule a timer for the next local midnight while open.
3. Month screen header: ‹ previous / next › month buttons. Next is disabled on the current month. Past months show their own
   starting point, activity and _Current budget_ labelled "Ended with" for closed months.
4. Carried-over line: "Carried over from October" with `+`/`−`; red when negative; `$0.00` neutral.
5. Driver: `travelTo(date)` (advance `page.clock`, then fire visibility change / bring to foreground), `goToMonth('October 2026')`.

## Behaviors to prove

- `on December 1st, November's leftover budget is carried into December`
- `recurring income and expenses are added again at the start of each month`
- `overspending in November starts December with a negative carry-over shown in red`
- `if the app isn't opened for two months, both months are filled in correctly`
- `rolling over from December 2026 to January 2027 works across the year boundary`
- `February 2028 rolls into March correctly in a leap year`
- `reopening the app many times in the same month never duplicates recurring lines`
- `the app rolls over at midnight even if it stays open`
- `an expense added at 11:30 pm on November 30 belongs to November`
- `past months can be viewed and show what they ended with`
- `you cannot navigate past the current month`

## Acceptance criteria

- [ ] No journey uses real waiting; all time travel uses the controlled clock.
- [ ] Property test (domain or use-case level): random sequences of "add entry / travel N days / reopen" keep
      every month's carried over equal to the previous month's ending budget.
- [ ] `pnpm verify` passes.

## Docs to update

`docs/architecture.md` §5.2 (triggers), `docs/testing.md` (driver: `travelTo`, `goToMonth`).

## Completion notes

_Filled in by the agent when done._
