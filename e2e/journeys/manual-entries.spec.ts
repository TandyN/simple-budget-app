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
    ['Carried over from October', '$0.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
    ['Groceries', '−$120.00'],
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
    ['Carried over from October', '$0.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
    ['Tax refund', '+$250.00'],
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
    ['Carried over from October', '$0.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
    ['Farmer market', '−$145.00'],
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
    ['Carried over from October', '$0.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
    ['Groceries', '−$120.00'],
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
    ['Carried over from October', '−$90.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
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

test("recurring lines can't be edited from the ledger; the app points you to Settings", async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.ledger.getByRole('button', { name: /Rent/ }).click();

  const dialog = budgetApp.page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Managed in your budget plan' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Open Settings' }).click();

  await expect(budgetApp.page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('a new expense appears at the top of Activity', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.addExpense({ name: 'Lunch', amount: '$15.00', date: '2026-11-04' });
  await budgetApp.addExpense({ name: 'Dinner', amount: '$35.00', date: '2026-11-05' });

  // Dinner (Nov 5) is newer than Lunch (Nov 4) so it appears first in Activity
  await expect(budgetApp.ledger).toShowLines([
    ['Carried over from October', '$0.00'],
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
    ['Dinner', '−$35.00'],
    ['Lunch', '−$15.00'],
  ]);
});
