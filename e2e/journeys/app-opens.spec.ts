import { expect, test } from '../support/budget-app';

test('the app opens and shows its name', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');

  await expect(budgetApp.appHeading).toHaveText('Simple Budget');
  await expect(budgetApp.mainRegion).toBeVisible();
  await expect(budgetApp.appStatus).toContainText('Version v');
});

test('the app keeps working offline after the first visit', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await expect(budgetApp.appStatus).toContainText('Offline ready');

  await budgetApp.goOffline();
  await budgetApp.reopenApp();

  await expect(budgetApp.appHeading).toHaveText('Simple Budget');
  await expect(budgetApp.appStatus).toContainText('Working offline');
});

test('the app recovers cleanly without a blank page after a release upgrade', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await expect(budgetApp.appStatus).toContainText('Offline ready');

  await budgetApp.simulateStaleCachedHtmlFromPreviousRelease();
  await budgetApp.reopenApp();

  await expect(budgetApp.appHeading).toHaveText('Simple Budget');
  await expect(budgetApp.mainRegion).toBeVisible();
});
