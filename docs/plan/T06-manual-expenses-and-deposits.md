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
4. Tap a manual row → same sheet in edit mode with *Delete*. Delete → row disappears + toast "Expense deleted · Undo" (5 s).
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

- [ ] Adding an expense takes ≤ 3 taps + typing from the month screen.
- [ ] The current budget updates instantly (no reload) after add/edit/delete/undo.
- [ ] Journeys pass on every device profile; screenshots reviewed (sheet in compact vs dialog in expanded).
- [ ] `pnpm verify` passes.

## Docs to update

`docs/testing.md` (driver), `docs/architecture.md` §5.4 if changed.

## Completion notes

_Filled in by the agent when done._

