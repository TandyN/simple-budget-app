# T05 — First-run setup & month ledger

**Depends on:** T03, T04 — **Milestone:** MVP

## Goal

The owner opens the app for the first time, enters monthly income and recurring expenses, and lands on the
month screen showing: carried over from last month (`$0.00`), monthly income (+), each recurring expense (−),
and the **current budget**.

## Read first

`docs/architecture.md` §5.1, `docs/design.md` (layouts, copy), `docs/testing.md` (driver), `AGENTS.md` glossary.

## Scope

**In:** setup flow screens, month screen (hero + ledger sections), `budgetApp.finishSetup`, `currentBudget`, `ledger`
locator + `toShowLines` matcher, persistence across reloads.
**Out:** manual entries (T06), month navigation (T07), tags in setup (T11 adds the tag picker to these rows).

## Steps

1. Route guard: if `settings.setupCompletedAt` is null → setup flow; else → month screen.
2. Setup flow (one screen per step in compact; side-by-side summary in expanded):
   1. Welcome — one sentence on privacy ("Your data stays on this phone").
   2. Monthly income — `MoneyField`, required, validation message from `parseMoneyInput`.
   3. Recurring expenses — list of rows (name + amount), *Add expense* button, remove (×) per row. Zero expenses is allowed.
   4. Summary — income, total recurring expenses, **purchase power**. *Start budgeting* → `completeSetup`.
3. Month screen:
   - Hero: "Current budget" label, big amount (`AmountText`, red if negative), month label in header.
   - Ledger section **Starting point**: *Carried over from {previous month}*, *Monthly income*, each recurring expense.
     Collapsible in compact (expanded by default the first month).
   - Ledger section **Activity**: empty state "No expenses or deposits yet".
   - Compact: bottom action bar with *Expense* / *Deposit* buttons (disabled placeholders until T06).
     Expanded: hero + actions in the left pane, ledger in the right.
4. Driver: `finishSetup({ monthlyIncome, recurringExpenses })`, `currentBudget`, `ledger`, custom matcher
   `toShowLines([[label, amount], ...])` that reads visible rows in order. Document them in `docs/testing.md`.

## Behaviors to prove

- `a brand-new user is asked for their monthly income before anything else`
- `setup cannot finish without a monthly income`
- `an amount like 12.345 is rejected during setup with a helpful message`
- `a recurring expense can be removed during setup before finishing`
- `the setup summary shows purchase power as income minus recurring expenses`
- `after setup, the ledger shows zero carried over, the monthly income, each recurring expense and the current budget`
  (e.g. \$5,000 income, Rent \$1,800, Phone \$60 → current budget `$3,140.00`)
- `setup works with no recurring expenses at all`
- `everything is still there after the app is closed and reopened`
- `setup is not shown again once it is finished`

## Acceptance criteria

- [ ] All journeys pass on every device profile.
- [ ] Screenshots of setup + month screen at Duo folded and unfolded, light and dark, reviewed.
- [ ] axe: no violations on setup and month screens.
- [ ] `pnpm verify` passes.

## Docs to update

`docs/testing.md` (driver table), `docs/architecture.md` §5.1 if it changed, `AGENTS.md` map for `src/ui/screens/`.

## Completion notes

_Filled in by the agent when done._

