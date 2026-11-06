import { expect, test } from '../support/budget-app';

test('the app opens and shows its name', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');

  await expect(budgetApp.appHeading).toHaveText('Simple Budget');
  await expect(budgetApp.mainRegion).toBeVisible();
});
