# Testing — human-readable first

The owner must be able to open any test and understand, without knowing the code, **what is being
tested and how**. Tests are the specification of this app. If a test is hard to read, it is wrong.

## The two kinds of tests

| Kind                               | Where                               | Tool                                                            | What it proves                                                                                                       |
| ---------------------------------- | ----------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Journey tests** (most important) | `e2e/journeys/*.spec.ts`            | Playwright, real app in WebKit + Chromium, every device profile | A real user doing a real thing sees the right result on screen.                                                      |
| **Rule tests**                     | `src/**/*.test.ts` next to the code | Vitest (+ fast-check)                                           | A business rule (money, calendar, ledger math) is exactly right, including edge cases a UI test can't reach cheaply. |

Journey tests start from an empty app and go through the **same screens the user would**: setup,
then the action, then read the number **off the screen**. No reaching into the database to arrange
things, no peeking at internal state to assert. The only shortcut allowed is loading history through
the app's **own import feature** (which is itself a user feature, and tested on its own).

## What a journey test looks like

```ts
import { test, expect } from '../support/budget-app';

test('an expense is subtracted from the current budget', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.addExpense({ name: 'Groceries', amount: '$120.00' });

  // $5,000.00 income − $1,800.00 rent − $120.00 groceries
  await expect(budgetApp.currentBudget).toHaveText('$3,080.00');
});
```

And a ledger check reads like the screen itself:

```ts
await expect(budgetApp.ledger).toShowLines([
  ['Carried over from October', '$0.00'],
  ['Monthly income', '+$5,000.00'],
  ['Rent', '−$1,800.00'],
  ['Groceries', '−$120.00'],
]);
```

## What a rule test looks like

```ts
describe('carrying the budget into the next month', () => {
  test('whatever is left in November is carried over into December', () => {
    const november = aMonthStatement({
      month: '2026-11',
      carriedOver: '$0.00',
      lines: [monthlyIncome('$5,000.00'), recurringExpense('Rent', '$1,800.00')],
    });

    const december = openNextMonth(november);

    expect(formatMoney(december.carriedOver)).toBe('$3,200.00');
  });
});
```

## The rules

1. **The test name is a sentence about what the user sees or what the rule guarantees.**
   ✅ `an expense is subtracted from the current budget` ❌ `test subtract` ❌ `handles edge case`
2. **Arrange like a user.** Journeys use `budgetApp.finishSetup(...)`, `budgetApp.addExpense(...)` —
   the real screens. Rule tests use builders named in plain English (`aRecurringExpense`, `monthlyIncome`).
3. **Money is written the way a human writes it:** `'$5,000.00'`, never `500000` or `5000.0`.
4. **Show the arithmetic** in a one-line comment above every money assertion.
5. **One behavior per test.** Blank lines separate _given_ / _when_ / _then_. Add `// Given` etc. only if it helps.
6. **Dates are explicit and fixed:** `budgetApp.openOn('2026-11-05')`, then `budgetApp.travelTo('2026-12-01')`.
   The clock is controlled (Playwright `page.clock`); timezone is fixed in the Playwright config.
7. **No CSS selectors or test-ids in tests.** The driver finds things by role and accessible name
   (`getByRole('button', { name: 'Add expense' })`), which also guarantees the app is accessible.
8. **No sleeps, no retries-until-green.** Use Playwright's auto-waiting `expect`.
9. **Full words for names:** `monthlyIncome`, `recurringExpenses`, `currentBudget` — never `inc`, `exp`, `bal`.
   Use the vocabulary from the glossary in `AGENTS.md`.
10. **The driver hides clicks, not meaning.** `budgetApp.addExpense(...)` may tap five things, but a
    reader must never need to open the driver to understand the test. Driver methods are verbs from
    the glossary; their parameters are exactly what the user would type.
11. **Edge cases get their own named tests**: leap years, December → January, negative carry-over,
    changing an amount twice in one month, opening the app after two months away.
12. **Property tests state their property in the name**:
    `for any sequence of expenses and deposits, the current budget equals carried over plus every line`.

## The readable driver (`e2e/support/budget-app.ts`)

The vocabulary grows with the plan. Each task adds the methods it needs and documents them here.

| Method / locator                                                                  | Does                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `openOn(date)`                                                                    | Sets the device clock to that local date and opens the app fresh (empty storage).      |
| `reopenApp()`                                                                     | Reloads the app, keeping its storage (proves data survives).                           |
| `appHeading`                                                                      | Locator for the top-level heading (`<h1>`).                                            |
| `mainRegion`                                                                      | Locator for the `<main>` landmark.                                                     |
| `appStatus`                                                                       | Locator for the app version & offline status indicator (`status`).                     |
| `goOffline()`                                                                     | Switches the browser context to offline mode (`context.setOffline(true)`).             |
| `goOnline()`                                                                      | Restores network connectivity (`context.setOffline(false)`).                           |
| `openOnWithQuery(date, query)`                                                    | Sets the device clock and opens the app with a query string (e.g. `'?debug=layout'`).  |
| `resizeViewport(width, height)`                                                   | Resizes the browser viewport mid-session to simulate folding/unfolding the device.     |
| `openInsights()` / `openSettings()` / `backToBudget()`                            | Navigates between Budget (`#/`), Insights (`#/insights`), and Settings (`#/settings`). |
| `debugLayoutOverlay`                                                              | Locator for the `?debug=layout` viewport/hinge overlay region.                         |
| `finishSetup({ monthlyIncome, recurringExpenses })`                               | (planned until T05) Walks the first-run setup screens.                                 |
| `addExpense({ name, amount, date?, tags? })`                                      | (planned until T06) Taps _Expense_, fills the sheet, saves.                            |
| `addDeposit({ name, amount, date?, tags? })`                                      | (planned until T06) Taps _Deposit_, fills the sheet, saves.                            |
| `changeMonthlyIncome(to, { takesEffect: 'this month' \| 'starting next month' })` | (planned until T08) Settings → income → choose when.                                   |
| `travelTo(date)`                                                                  | (planned until T07) Moves the clock forward and brings the app back to the foreground. |
| `currentBudget`                                                                   | (planned until T05) Locator for the big current-budget number.                         |
| `ledger`                                                                          | (planned until T05) Locator for the ledger; use with `toShowLines([...])`.             |

## Readable domain test builders (`src/domain/test-builders.ts`)

Rule tests in `src/domain/*.test.ts` arrange scenarios in plain English using human-formatted money strings:

| Builder                                                 | Does                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `money('$5,000.00')`                                    | Parses a human-formatted positive or signed dollar string into integer `Cents`.         |
| `aRecurringIncome({ amount, startMonth?, endMonth? })`  | Builds a `RecurringItem` of kind `'income'` for the budget plan.                        |
| `aRecurringExpense({ name, amount, startMonth?, ... })` | Builds a `RecurringItem` of kind `'expense'` for the budget plan.                       |
| `monthlyIncome('$5,000.00')`                            | Drafts a monthly income recurring statement line for `aMonthStatement(...)`.            |
| `recurringExpense(name, amount)`                        | Drafts a recurring expense statement line for `aMonthStatement(...)`.                   |
| `anExpense({ name, amount, date?, tagIds? })`           | Builds a negative manual `LedgerEntry`.                                                 |
| `aDeposit({ name, amount, date?, tagIds? })`            | Builds a positive manual `LedgerEntry`.                                                 |
| `aMonthStatement({ month, carriedOver?, lines })`       | Computes a full `MonthStatement` from a carried-over balance and month lines.           |
| `openNextMonth(previousStatement, linesInNextMonth?)`   | Rolls the previous month's `currentBudget` into the next month's `carriedOver` balance. |

## Device coverage

Every journey runs on every profile in `config/devices.ts`: iPhone Duo folded, iPhone Duo unfolded,
plus a regular iPhone and an Android phone, on WebKit (and Chromium for the Android profile).
A test that only makes sense in one layout says so in its name: `when unfolded, the calendar sits beside the ledger`.

## Running tests

- Full verification gate (required before every commit): `pnpm verify` (or `bash scripts/verify.sh`)
- All rule/unit tests: `pnpm test`
- All journey tests across all device profiles: `pnpm test:e2e`
- Single journey file or device profile: `pnpm test:e2e e2e/journeys/app-opens.spec.ts --project=iphone-duo-folded`
- Fast Chromium-only run on iPhone Duo folded: `pnpm test:e2e --project=chromium-iphone-duo-folded`
