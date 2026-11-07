# T06 — Manual expenses & deposits

**Depends on:** T05 — **Milestone:** MVP

## Goal

Tap **Expense** to subtract or **Deposit** to add a line to the budget in a couple of seconds, edit or delete
lines, and undo mistakes.

## Read first

`docs/architecture.md` §5.4, `docs/design.md` (sheets, copy), `docs/testing.md`.

## Scope

**In:** entry sheet (amount, name, date, note), use-cases `addEntry`, `updateEntry`, `deleteEntry`/`restoreEntry`,
activity list, edit by tapping a row, delete with Undo toast, guard for recurring/adjustment rows.
**Out:** tags (T11 adds a tag picker slot in this sheet — leave a clear spot for it), calendar filtering (T12).

## Steps

1. Entry sheet (shared by Expense and Deposit, titled accordingly):
   - Amount first, autofocused, `inputmode="decimal"`, big tabular digits. Validated with `parseMoneyInput`.
   - Name (placeholder "What was it?"; default "Expense"/"Deposit" if left blank).
   - Date, defaults to today; any date allowed (month derived from date). Note (optional, collapsed).
   - Save button disabled until the amount is valid; Enter submits.
2. Use-cases in one transaction each; amounts signed (expense negative, deposit positive) — the sign comes from the
   button pressed, never from the user typing a minus.
3. Activity rows: name, date ("Nov 5"), amount with sign/color. Newest first; same-day ties by creation time.
4. Tap a manual row → same sheet in edit mode with _Delete_. Delete → row disappears + toast "Expense deleted · Undo" (5 s).
5. Tap a recurring or adjustment row → small sheet explaining it comes from the budget plan, with a button to Settings.
6. Driver: `addExpense`, `addDeposit`, `editEntry(name, changes)`, `deleteEntry(name)`, `undo()`.

## Behaviors to prove

- `an expense is subtracted from the current budget` (the canonical example in `docs/testing.md`)
- `a deposit is added to the current budget`
- `several expenses and deposits add up correctly`
- `editing an expense amount updates the current budget`
- `deleting an expense gives the money back, and undo brings the expense back`
- `an expense dated last month changes last month and the amount carried over into this month`
- `amounts with more than two decimals are rejected with a helpful message`
- `the save button stays disabled until a valid amount is entered`
- `recurring lines can't be edited from the ledger; the app points you to Settings`
- `a new expense appears at the top of Activity`

## Acceptance criteria

- [x] Adding an expense takes ≤ 3 taps + typing from the month screen.
- [x] The current budget updates instantly (no reload) after add/edit/delete/undo.
- [x] Journeys pass on every device profile; screenshots reviewed (sheet in compact vs dialog in expanded).
- [x] `pnpm verify` passes.

## Docs to update

`docs/testing.md` (driver), `docs/architecture.md` §5.4 if changed.

## Completion notes

- Added repository helpers `getLedgerEntryById` and `removeLedgerEntry` (`src/data/repositories/index.ts`) and single-transaction application use-cases `addEntry`, `updateEntry`, `deleteEntry`, and `restoreEntry` (`src/app/use-cases/index.ts`) with rule test coverage in `src/app/use-cases/use-cases.test.ts`.
- Built the shared `EntrySheet` (`src/ui/screens/month/EntrySheet.tsx`) for adding and editing manual expenses and deposits: autofocused `MoneyField` (`inputMode="decimal"`, validated with `parseMoneyInput`), `Name` (defaulting to `"Expense"` / `"Deposit"` if blank), `Date` (defaulting to today, deriving `monthKey`), collapsible `Note`, a reserved slot for T11 tags, disabled `Save` until valid, and `Delete` in edit mode.
- Updated `MonthScreen` (`src/ui/screens/month/MonthScreen.tsx`) and `App` (`src/App.tsx`) with interactive manual Activity rows (newest first with formatted short dates like `"Nov 5"`), a 5-second `"Expense deleted"` / `"Deposit deleted"` `Undo` toast, and a guard sheet (`Managed in your budget plan`) when tapping a recurring or adjustment line that links to Settings.
- Added `addExpense`, `addDeposit`, `editEntry`, `deleteEntry`, and `undo` to `BudgetAppDriver` (`e2e/support/budget-app.ts`), plus all 10 required E2E journeys and `@axe-core/playwright` check in `e2e/journeys/manual-entries.spec.ts`.
- Visual inspection screenshots captured for the entry sheet in compact drawer mode and expanded centered dialog mode:
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t06-sheet-compact-light.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t06-sheet-expanded-dark.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t06-activity-compact-light.png`
  - `/home/tandy/.gemini/antigravity/brain/d2558615-9ffa-49ed-88e9-2c350ebacfb1/t06-activity-expanded-dark.png`
