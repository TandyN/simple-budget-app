# T08 — Budget plan changes (this month vs next month)

**Depends on:** T07 — **Milestone:** MVP

## Goal

In Settings, change monthly income and add/edit/remove recurring expenses. Every change that affects money asks
**"When should this change take effect?"** — *This month (November)* adds an adjustment line now;
*Starting next month (December)* leaves this month alone.

## Read first

`docs/architecture.md` §5.3 (the table is the spec), `src/domain/budget-plan-changes.ts` (built in T02).

## Scope

**In:** Settings → Budget plan screen (income, recurring expenses list, purchase power), edit sheets, the timing prompt
with a preview of its effect, adjustment ledger lines with clear labels, use-case `applyPlanChange`.
**Out:** tags on recurring expenses (T11), data/backup section (T09).

## Steps

1. Settings screen (list → detail across panes when expanded): *Budget plan* section with Monthly income, Recurring expenses
   (name, amount, *Add recurring expense*), and Purchase power (live).
2. Edit sheet for income / an expense: amount + name. Remove action for expenses (confirm).
3. If money is affected → timing prompt (`SegmentedControl` or two big buttons), each option with a one-line preview:
   - This month: "Adds a +\$500.00 adjustment to November."
   - Starting next month: "November stays the same. December uses \$5,500.00."
4. Name-only edits apply immediately without the prompt (default decision — see `docs/plan/README.md`).
5. Adjustment line labels, e.g. *Monthly income changed \$5,000.00 → \$5,500.00* `+$500.00`, *Gym added* `−$40.00`,
   *Phone removed* `+$60.00`. They appear in **Activity** with today's date.
6. Driver: `changeMonthlyIncome(to, { takesEffect })`, `addRecurringExpense({ name, amount }, { takesEffect })`,
   `changeRecurringExpense(name, { amount?, name? }, { takesEffect? })`, `removeRecurringExpense(name, { takesEffect })`,
   `purchasePower` locator.

## Behaviors to prove

- `raising income for this month adds a +$500.00 adjustment line and raises the current budget`
- `raising income starting next month leaves this month unchanged and December shows the new income`
- `lowering income this month adds a negative adjustment line`
- `adding a recurring expense this month subtracts it now with an adjustment line`
- `adding a recurring expense starting next month first appears in December`
- `removing a recurring expense this month refunds it with an adjustment line`
- `removing a recurring expense starting next month keeps it this month and drops it in December`
- `changing an amount twice in one month only adjusts by the total difference`
  (\$5,000 → \$5,500 this month, then \$5,500 → \$5,200 this month ⇒ adjustments net `+$200.00`)
- `renaming a recurring expense doesn't ask when it should take effect`
- `purchase power updates as the plan changes`
- `the prompt explains exactly what each choice will do before you pick`

## Acceptance criteria

- [ ] Every row of the table in `docs/architecture.md` §5.3 has a passing journey.
- [ ] Snapshot lines of the current month are never modified by a money change (assert at use-case level too).
- [ ] `pnpm verify` passes; screenshots of Settings and the prompt at both Duo sizes reviewed.

## Docs to update

`docs/architecture.md` §5.3 (if anything changed), `docs/testing.md` (driver), `docs/plan/README.md` decisions if the owner changed one.

## Completion notes

_Filled in by the agent when done._

