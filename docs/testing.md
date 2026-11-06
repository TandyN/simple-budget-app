# Testing — human-readable first

The owner must be able to open any test and understand, without knowing the code, **what is being
tested and how**. Tests are the specification of this app. If a test is hard to read, it is wrong.

## The two kinds of tests

| Kind | Where | Tool | What it proves |
| --- | --- | --- | --- |
| **Journey tests** (most important) | `e2e/journeys/*.spec.ts` (planned) | Playwright, real app in WebKit + Chromium, every device profile | A real user doing a real thing sees the right result on screen. |
| **Rule tests** | `src/**/*.test.ts` next to the code (planned) | Vitest (+ fast-check) | A business rule (money, calendar, ledger math) is exactly right, including edge cases a UI test can't reach cheaply. |

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
  ['Monthly income',            '+$5,000.00'],
  ['Rent',                      '−$1,800.00'],
  ['Groceries',                 '−$120.00'],
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
5. **One behavior per test.** Blank lines separate *given* / *when* / *then*. Add `// Given` etc. only if it helps.
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

## The readable driver (`e2e/support/budget-app.ts`) (planned until T01)

The vocabulary grows with the plan. Each task adds the methods it needs and documents them here.

| Method / locator | Does |
| --- | --- |
| `openOn(date)` | Sets the device clock to that local date and opens the app fresh (empty storage). |
| `finishSetup({ monthlyIncome, recurringExpenses })` | Walks the first-run setup screens. |
| `addExpense({ name, amount, date?, tags? })` | Taps *Expense*, fills the sheet, saves. |
| `addDeposit({ name, amount, date?, tags? })` | Taps *Deposit*, fills the sheet, saves. |
| `changeMonthlyIncome(to, { takesEffect: 'this month' \| 'starting next month' })` | Settings → income → choose when. |
| `travelTo(date)` | Moves the clock forward and brings the app back to the foreground (triggers rollover). |
| `reopenApp()` | Reloads the app, keeping its storage (proves data survives). |
| `currentBudget` | Locator for the big current-budget number. |
| `ledger` | Locator for the ledger; use with `toShowLines([...])`. |

## Device coverage

Every journey runs on every profile in `config/devices.ts` (planned): iPhone Duo folded, iPhone Duo unfolded,
plus a regular iPhone and an Android phone, on WebKit (and Chromium for the Android profile).
A test that only makes sense in one layout says so in its name: `when unfolded, the calendar sits beside the ledger`.

## Running tests

See `docs/developer-setup.md` for the exact commands. The gate before every commit is
`bash scripts/verify.sh`, which runs everything.
