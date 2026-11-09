import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../support/budget-app';

test('an expense is subtracted from the current budget', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.addExpense({ name: 'Groceries', amount: '$120.00' });

  // $5,000.00 income − $1,800.00 rent − $120.00 groceries = $3,080.00
  await expect(budgetApp.currentBudget).toHaveText('$3,080.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Groceries', '−$120.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
  ]);

  const axeResults = await new AxeBuilder({ page: budgetApp.page }).analyze();
  expect(axeResults.violations).toEqual([]);
});

test('a deposit is added to the current budget', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.addDeposit({ name: 'Tax refund', amount: '$250.00' });

  // $5,000.00 income − $1,800.00 rent + $250.00 tax refund = $3,450.00
  await expect(budgetApp.currentBudget).toHaveText('$3,450.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Tax refund', '+$250.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
  ]);
});

test('several expenses and deposits add up correctly', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.addExpense({ name: 'Groceries', amount: '$120.50' });
  await budgetApp.addExpense({ name: 'Coffee', amount: '$6.25' });
  await budgetApp.addDeposit({ name: 'Sold jacket', amount: '$40.00' });

  // $5,000.00 − $1,800.00 − $120.50 − $6.25 + $40.00 = $3,113.25
  await expect(budgetApp.currentBudget).toHaveText('$3,113.25');
});

test('editing an expense amount updates the current budget', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });
  await budgetApp.addExpense({ name: 'Groceries', amount: '$120.00' });

  await budgetApp.editEntry('Groceries', { amount: '$145.00', name: 'Farmer market' });

  // $5,000.00 income − $1,800.00 rent − $145.00 farmer market = $3,055.00
  await expect(budgetApp.currentBudget).toHaveText('$3,055.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Farmer market', '−$145.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
  ]);
});

test('deleting an expense gives the money back, and undo brings the expense back', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });
  await budgetApp.addExpense({ name: 'Groceries', amount: '$120.00' });

  await budgetApp.deleteEntry('Groceries');

  // $3,080.00 + $120.00 deleted groceries = $3,200.00
  await expect(budgetApp.currentBudget).toHaveText('$3,200.00');
  await expect(
    budgetApp.page.getByRole('status').filter({ hasText: 'Expense deleted' }),
  ).toBeVisible();

  await budgetApp.undo();

  // Undoing restores Groceries (−$120.00) -> $3,080.00
  await expect(budgetApp.currentBudget).toHaveText('$3,080.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Groceries', '−$120.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
  ]);
});

test('an expense dated last month changes last month and the amount carried over into this month', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.addExpense({
    name: 'October electric bill',
    amount: '$90.00',
    date: '2026-10-29',
  });

  // Carried over from October becomes −$90.00; November budget becomes $3,200.00 − $90.00 = $3,110.00
  await expect(budgetApp.currentBudget).toHaveText('$3,110.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
    ['Carried over from October', '−$90.00'],
  ]);
});

test('amounts with more than two decimals are rejected with a helpful message', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
  });

  await budgetApp.page.getByRole('button', { name: 'Add expense' }).click();
  const dialog = budgetApp.page.getByRole('dialog');
  await dialog.getByLabel('Amount').fill('19.999');

  await expect(dialog.getByRole('alert')).toHaveText(
    'Amounts can have at most two decimal places (cents).',
  );
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('the save button stays disabled until a valid amount is entered', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
  });

  await budgetApp.page.getByRole('button', { name: 'Add expense' }).click();
  const dialog = budgetApp.page.getByRole('dialog');
  const saveButton = dialog.getByRole('button', { name: 'Save' });

  await expect(saveButton).toBeDisabled();

  await dialog.getByLabel('Amount').fill('$24.00');
  await expect(saveButton).toBeEnabled();
});

test('a recurring line can be edited for this month like any other transaction', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.editEntry('Rent', { amount: '$1,700.00' });

  // $5,000.00 income − $1,700.00 rent (edited for this month only) = $3,300.00
  await expect(budgetApp.currentBudget).toHaveText('$3,300.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,700.00'],
  ]);
});

test('a recurring line has no delete button, because it comes from the budget plan', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.ledger.getByRole('button', { name: /Rent/ }).click();

  const dialog = budgetApp.page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete' })).toHaveCount(0);
});

test('a new expense appears at the top of Activity', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.addExpense({ name: 'Lunch', amount: '$15.00', date: '2026-11-04' });
  await budgetApp.addExpense({ name: 'Dinner', amount: '$35.00', date: '2026-11-05' });

  // Newest first: Dinner (Nov 5), then Lunch (Nov 4), then the plan's lines posted on Nov 1
  await expect(budgetApp.ledger).toShowLines([
    ['Dinner', '−$35.00'],
    ['Lunch', '−$15.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
  ]);
});

test('the add sheet asks for a description and a date that starts as today', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({ monthlyIncome: '$5,000.00' });

  await budgetApp.page.getByRole('button', { name: 'Add expense' }).click();
  const dialog = budgetApp.page.getByRole('dialog');

  await expect(dialog.getByLabel('Description')).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveCount(0);
  await expect(dialog.getByLabel('Date')).toHaveValue('2026-11-05');
});

test('every activity row shows when it happened, and the time can be set by hand', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({ monthlyIncome: '$5,000.00' });

  await budgetApp.addExpense({
    name: 'Lunch',
    amount: '$15.00',
    date: '2026-11-04',
    time: '13:15',
  });

  await expect(budgetApp.ledger.getByRole('button', { name: /Lunch/ })).toContainText(
    /Nov 4 · 1:15\s?PM/,
  );

  await budgetApp.editEntry('Lunch', { time: '18:45' });

  await expect(budgetApp.ledger.getByRole('button', { name: /Lunch/ })).toContainText(
    /Nov 4 · 6:45\s?PM/,
  );
});

test('activity is split into pages so the app fits on one screen', async ({ budgetApp }) => {
  await budgetApp.foldScreen();
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });
  // Each expense gets a distinct time so the "newest first" order is unambiguous.
  for (const [name, time] of [
    ['One', '13:00'],
    ['Two', '14:00'],
    ['Three', '15:00'],
    ['Four', '16:00'],
  ]) {
    await budgetApp.addExpense({ name, amount: '$1.00', time });
  }

  // Newest first: the four newest expenses plus the first plan line fill page one.
  await expect(budgetApp.ledger).toShowLines([
    ['Four', '−$1.00'],
    ['Three', '−$1.00'],
    ['Two', '−$1.00'],
    ['One', '−$1.00'],
    ['Monthly income', '+$5,000.00'],
  ]);
  await expect(budgetApp.page.getByText('Page 1 of 2')).toBeVisible();

  await budgetApp.page.getByRole('button', { name: 'Next page' }).click();

  await expect(budgetApp.ledger).toShowLines([['Rent', '−$1,800.00']]);
  await expect(budgetApp.page.getByText('Page 2 of 2')).toBeVisible();
});
