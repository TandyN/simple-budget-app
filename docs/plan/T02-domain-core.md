# T02 — Domain core: money, calendar, ledger math

**Depends on:** T01 — **Milestone:** Foundation

## Goal

Pure, exhaustively tested TypeScript modules for the three things that must never be wrong:
money, the calendar, and the month's ledger math (including plan changes). No UI, no database.

## Read first

`AGENTS.md` golden rules + glossary, `docs/architecture.md` §4–5, `docs/testing.md` (rule tests, property tests).

## Scope

**In:** `src/domain/money.ts`, `calendar.ts`, `ledger.ts`, `budget-plan-changes.ts` + tests + readable test builders.
**Out:** persistence, React, tags beyond carrying `tagIds: string[]` through, insights (T13).

## Steps

1. **money.ts**
   - `Cents` branded integer type; `cents(n)` guard (throws on non-integer / unsafe).
   - `parseMoneyInput(text)` → `{ ok: true, cents } | { ok: false, reason }`. Accepts `12`, `12.5`, `12.50`, `$1,234.56`,
     surrounding spaces. Rejects empty, negative, >2 decimals, letters, > \$99,999,999.99. Reasons are user-facing sentences.
   - `formatMoney(cents, { sign: 'auto' | 'always' })` via `Intl.NumberFormat('en-US', { currency: 'USD' })`,
     using the true minus `−` and `+` when `sign: 'always'`.
   - `sumCents`, `negate`.
2. **calendar.ts** (no `Temporal`, no timezone math; dates are local calendar strings)
   - Types/validators: `IsoDate` (`YYYY-MM-DD`), `MonthKey` (`YYYY-MM`).
   - `todayIn(clock)` → local `IsoDate`; `monthKeyOf(date)`; `firstDayOf(month)`.
   - `isLeapYear(year)`, `daysInMonth(month)`, `addMonths(month, n)`, `compareMonths`, `monthsFromTo(a, b)` (inclusive),
     `weekdayOf(date)` (computed with `Date.UTC` so DST can't interfere), `daysLeftInMonth(date)` (including today).
   - `buildMonthGrid(month, weekStartsOn)` → whole weeks of `{ date, inMonth, isToday? }`.
   - `monthLabel(month)` → "November 2026"; `previousMonthName(month)` → "October".
3. **ledger.ts**
   - Types from `docs/architecture.md` §4 (`LedgerEntry`, `RecurringItem`, `OpenedMonth`).
   - `isActiveIn(item, month)`, `signedAmount(item)`.
   - `recurringEntriesToOpen(items, month, existingRecurrenceKeys, ids, now)` → entries for opening a month.
   - `monthStatement({ month, entriesBefore, entriesIn })` → `{ carriedOver, startingPoint[], activity[], totalIn, totalOut, currentBudget }`
     with ordering: carried over, monthly income, recurring expenses (by name), then activity newest first.
   - `purchasePower(items, month)`.
4. **budget-plan-changes.ts**
   - `planChange({ change, takesEffect: 'this-month' | 'starting-next-month', currentMonth, itemsNow, entriesThisMonth, ids, now })`
     → `{ itemUpserts, entriesToAdd }` implementing the table in `docs/architecture.md` §5.3.
   - "Amount in effect this month" = the item's snapshot line + its adjustment lines this month.
5. **Test builders** in `src/domain/test-builders.ts`: `monthlyIncome('$5,000.00')`, `aRecurringExpense({ name, amount })`,
   `anExpense({ name, amount, date })`, `aDeposit(...)`, `aMonthStatement(...)` — accept human money strings.
6. Property tests (fast-check) for the invariants below.

## Behaviors to prove

Money

- `typing 12.5 means twelve dollars and fifty cents`
- `typing $1,234.56 with a dollar sign and comma is understood`
- `amounts with three decimal places are rejected with a helpful message`
- `negative, empty and non-numeric amounts are rejected`
- `negative amounts are shown with a true minus sign: −$40.00`
- `money in is shown with a plus sign when asked: +$500.00`
- `for any amount, formatting then parsing gives back the same cents`

Calendar

- `February 2028 has 29 days because 2028 is a leap year`
- `February 2100 has 28 days because century years are not leap years`
- `February 2000 had 29 days because years divisible by 400 are leap years`
- `the month after December 2026 is January 2027`
- `the month before January 2027 is December 2026`
- `November 2026 starts on a Sunday`
- `a month grid always contains whole weeks and every day of the month exactly once`
- `the grid can start weeks on Monday`
- `days left in November on the 5th is 26, counting today`
- `for any month, adding then subtracting n months returns the same month`

Ledger

- `the very first month carries over zero`
- `the current budget is carried over plus income minus expenses`
- `whatever is left in November is carried over into December`
- `overspending in November carries a negative budget into December`
- `opening a month adds every active recurring income and expense once`
- `opening the same month twice adds nothing the second time`
- `a recurring expense that ended in November is not added in December`
- `a recurring expense that starts in December is not added in November`
- `purchase power is monthly income minus all recurring expenses`
- `for any sequence of expenses and deposits, the current budget equals carried over plus every line`
- `for any months, each month's carried over equals the previous month's current budget`

Budget plan changes

- `raising income this month adds a +$500.00 adjustment and changes the plan from next month`
- `raising income starting next month changes the plan but adds no adjustment`
- `lowering income this month adds a negative adjustment`
- `adding a recurring expense this month adds a negative adjustment and starts it next month`
- `removing a recurring expense this month refunds it with a positive adjustment and ends it this month`
- `removing a recurring expense starting next month keeps it this month only`
- `changing an amount twice in one month only adjusts by the total difference`

## Acceptance criteria

- [ ] 100% line and branch coverage for `src/domain/**` (enforced by Vitest thresholds).
- [ ] No imports from React, Dexie, DOM APIs (other than `Intl`) in `src/domain/` (lint enforced).
- [ ] All money values are `Cents`; there is no floating-point arithmetic on money anywhere.
- [ ] Every behavior above is a test with that name (polished wording is fine).
- [ ] `pnpm verify` passes.

## Docs to update

`AGENTS.md` (`src/domain/` row), `docs/architecture.md` (any signature or rule that differs from the plan), `docs/testing.md` (builders).

## Completion notes

_Filled in by the agent when done._
