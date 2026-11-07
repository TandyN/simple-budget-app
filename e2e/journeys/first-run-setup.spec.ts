import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../support/budget-app';

test('a brand-new user is asked for their monthly income before anything else', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');

  await expect(budgetApp.page.getByText('Your data stays on this phone.')).toBeVisible();
  await budgetApp.page.getByRole('button', { name: 'Get started' }).click();

  await expect(
    budgetApp.page.getByRole('heading', { name: 'What is your monthly income?' }),
  ).toBeVisible();
  await expect(budgetApp.page.getByLabel('Monthly income')).toBeVisible();

  const axeResults = await new AxeBuilder({ page: budgetApp.page }).analyze();
  expect(axeResults.violations).toEqual([]);
});

test('setup cannot finish without a monthly income', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.page.getByRole('button', { name: 'Get started' }).click();

  await budgetApp.page.getByRole('button', { name: 'Continue' }).click();

  await expect(budgetApp.page.getByRole('alert')).toHaveText('Please enter an amount.');
  await expect(
    budgetApp.page.getByRole('heading', { name: 'What is your monthly income?' }),
  ).toBeVisible();
});

test('an amount like 12.345 is rejected during setup with a helpful message', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.page.getByRole('button', { name: 'Get started' }).click();

  await budgetApp.page.getByLabel('Monthly income').fill('12.345');

  await expect(budgetApp.page.getByRole('alert')).toHaveText(
    'Amounts can have at most two decimal places (cents).',
  );
});

test('a recurring expense can be removed during setup before finishing', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.page.getByRole('button', { name: 'Get started' }).click();
  await budgetApp.page.getByLabel('Monthly income').fill('$5,000.00');
  await budgetApp.page.getByRole('button', { name: 'Continue' }).click();

  await budgetApp.page.getByLabel('Expense name').fill('Rent');
  await budgetApp.page.getByLabel('Expense amount').fill('$1,800.00');
  await budgetApp.page.getByRole('button', { name: 'Add recurring expense' }).click();

  await budgetApp.page.getByLabel('Expense name').fill('Gym');
  await budgetApp.page.getByLabel('Expense amount').fill('$50.00');
  await budgetApp.page.getByRole('button', { name: 'Add recurring expense' }).click();

  await budgetApp.page.getByRole('button', { name: 'Remove Gym' }).click();
  await budgetApp.page.getByRole('button', { name: 'Review plan' }).click();
  await budgetApp.page.getByRole('button', { name: 'Start budgeting' }).click();

  // $5,000.00 income − $1,800.00 rent (Gym was removed) = $3,200.00
  await expect(budgetApp.currentBudget).toHaveText('$3,200.00');
});

test('the setup summary shows available funds as income minus recurring expenses', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.page.getByRole('button', { name: 'Get started' }).click();
  await budgetApp.page.getByLabel('Monthly income').fill('$5,000.00');
  await budgetApp.page.getByRole('button', { name: 'Continue' }).click();

  await budgetApp.page.getByLabel('Expense name').fill('Rent');
  await budgetApp.page.getByLabel('Expense amount').fill('$1,800.00');
  await budgetApp.page.getByRole('button', { name: 'Add recurring expense' }).click();

  await budgetApp.page.getByLabel('Expense name').fill('Phone');
  await budgetApp.page.getByLabel('Expense amount').fill('$60.00');
  await budgetApp.page.getByRole('button', { name: 'Add recurring expense' }).click();

  await budgetApp.page.getByRole('button', { name: 'Review plan' }).click();

  const summary = budgetApp.page.getByRole('region', { name: 'Budget plan summary' });
  // $5,000.00 income − ($1,800.00 rent + $60.00 phone = $1,860.00) = $3,140.00 available funds
  await expect(summary).toContainText('+$5,000.00');
  await expect(summary).toContainText('−$1,860.00');
  await expect(summary).toContainText('$3,140.00');
});

test('after setup, the ledger shows monthly income, each recurring expense and the current budget', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [
      { name: 'Rent', amount: '$1,800.00' },
      { name: 'Phone', amount: '$60.00' },
    ],
  });

  // $5,000.00 income − $1,800.00 rent − $60.00 phone = $3,140.00
  await expect(budgetApp.currentBudget).toHaveText('$3,140.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Monthly income', '+$5,000.00'],
    ['Phone', '−$60.00'],
    ['Rent', '−$1,800.00'],
  ]);

  const axeResults = await new AxeBuilder({ page: budgetApp.page }).analyze();
  expect(axeResults.violations).toEqual([]);
});

test('setup works with no recurring expenses at all', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$4,200.00',
    recurringExpenses: [],
  });

  // $4,200.00 income − $0.00 recurring expenses = $4,200.00
  await expect(budgetApp.currentBudget).toHaveText('$4,200.00');
  await expect(budgetApp.ledger).toShowLines([['Monthly income', '+$4,200.00']]);
});

test('everything is still there after the app is closed and reopened', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.reopenApp();

  // $5,000.00 income − $1,800.00 rent = $3,200.00
  await expect(budgetApp.currentBudget).toHaveText('$3,200.00');
  await expect(budgetApp.ledger).toShowLines([
    ['Monthly income', '+$5,000.00'],
    ['Rent', '−$1,800.00'],
  ]);
});

test('setup is not shown again once it is finished', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await budgetApp.reopenApp();

  await expect(budgetApp.page.getByText('Your data stays on this phone.')).toHaveCount(0);
  await expect(budgetApp.currentBudget).toHaveText('$3,200.00');
  await expect(budgetApp.page.getByText('November 2026')).toBeVisible();
});
