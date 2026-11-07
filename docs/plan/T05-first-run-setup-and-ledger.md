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
   3. Recurring expenses — list of rows (name + amount), _Add expense_ button, remove (×) per row. Zero expenses is allowed.
   4. Summary — income, total recurring expenses, **purchase power**. _Start budgeting_ → `completeSetup`.
3. Month screen:
   - Hero: "Current budget" label, big amount (`AmountText`, red if negative), month label in header.
   - Ledger section **Starting point**: _Carried over from {previous month}_, _Monthly income_, each recurring expense.
     Collapsible in compact (expanded by default the first month).
   - Ledger section **Activity**: empty state "No expenses or deposits yet".
   - Compact: bottom action bar with _Expense_ / _Deposit_ buttons (disabled placeholders until T06).
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

- [x] All journeys pass on every device profile.
- [x] Screenshots of setup + month screen at Duo folded and unfolded, light and dark, reviewed.
- [x] axe: no violations on setup and month screens.
- [x] `pnpm verify` passes.

## Docs to update

`docs/testing.md` (driver table), `docs/architecture.md` §5.1 if it changed, `AGENTS.md` map for `src/ui/screens/`.

## Completion notes

- Added `useAppSettings` and `getDefaultAppDependencies` in `src/app/hooks/useAppSettings.ts` to observe `settings.setupCompletedAt` in IndexedDB and route between the first-run setup flow and the month ledger.
- Implemented the 4-step `SetupScreen` (`src/ui/screens/setup/SetupScreen.tsx`) with Welcome, Monthly income (`parseMoneyInput` validation), Recurring expenses (add/remove rows, zero recurring expenses allowed), and Summary (live purchase power preview, side-by-side summary pane in expanded layout, and _Start budgeting_ calling `completeSetup`).
- Implemented `MonthScreen` (`src/ui/screens/month/MonthScreen.tsx`) with the `Current budget` hero (`AmountText` red when negative), `Starting point` (collapsible in compact mode, expanded by default), and `Activity` (`No expenses or deposits yet` empty state).
- Added `finishSetup`, `currentBudget`, `ledger`, and custom `toShowLines([[label, amount], ...])` matcher to `BudgetAppDriver` (`e2e/support/budget-app.ts`), plus all 9 E2E journeys and `@axe-core/playwright` checks in `e2e/journeys/first-run-setup.spec.ts`.
- Visual inspection screenshots captured at both iPhone Duo sizes in light and dark mode:
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-setup-duo-folded-light.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-setup-duo-folded-dark.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-setup-duo-unfolded-light.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-setup-duo-unfolded-dark.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-month-duo-folded-light.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-month-duo-folded-dark.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-month-duo-unfolded-light.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t05-month-duo-unfolded-dark.png`
