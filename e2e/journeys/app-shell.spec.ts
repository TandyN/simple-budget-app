import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../support/budget-app';

test('when folded, the app uses a single column with the action bar at the bottom', async ({
  budgetApp,
}) => {
  await budgetApp.foldScreen();
  await budgetApp.openOn('2026-11-05');

  await expect(budgetApp.singleColumnRegion).toBeVisible();
  await expect(budgetApp.twoPaneRegion).toHaveCount(0);
  await expect(budgetApp.actionBar).toBeVisible();

  const positions = await budgetApp.page.evaluate(() => {
    const columnRect = document
      .querySelector('[role="region"][aria-label="Single column layout"]')
      ?.getBoundingClientRect();
    const toolbarRect = document
      .querySelector('[role="toolbar"][aria-label="Budget actions"]')
      ?.getBoundingClientRect();
    const scrollOverflow =
      document.documentElement.scrollWidth > document.documentElement.clientWidth;
    return {
      columnTop: columnRect?.top ?? 0,
      toolbarTop: toolbarRect?.top ?? 0,
      scrollOverflow,
    };
  });

  expect(positions.toolbarTop).toBeGreaterThan(positions.columnTop);
  expect(positions.scrollOverflow).toBe(false);
});

test('when unfolded, the app shows two panes split at the hinge with nothing crossing the center line', async ({
  budgetApp,
}) => {
  await budgetApp.unfoldScreen();
  await budgetApp.openOn('2026-11-05');

  await expect(budgetApp.twoPaneRegion).toBeVisible();
  await expect(budgetApp.overviewPane).toBeVisible();
  await expect(budgetApp.ledgerPane).toBeVisible();

  const geometry = await budgetApp.page.evaluate(() => {
    const centerX = window.innerWidth / 2;
    const panes = Array.from(document.querySelectorAll('.sb-pane'));
    const leftRect = panes[0]?.getBoundingClientRect();
    const rightRect = panes[1]?.getBoundingClientRect();

    const interactiveOrCardNodes = Array.from(
      document.querySelectorAll('.sb-two-pane .sb-card, .sb-two-pane button, .sb-two-pane input'),
    );
    const crossingNodes = interactiveOrCardNodes.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.left < centerX - 1 && rect.right > centerX + 1;
    });

    const scrollOverflow =
      document.documentElement.scrollWidth > document.documentElement.clientWidth;

    return {
      centerX,
      leftRightEdge: leftRect?.right ?? 0,
      rightLeftEdge: rightRect?.left ?? 0,
      crossingCount: crossingNodes.length,
      scrollOverflow,
    };
  });

  expect(geometry.leftRightEdge).toBeLessThanOrEqual(geometry.centerX);
  expect(geometry.rightLeftEdge).toBeGreaterThanOrEqual(geometry.centerX);
  expect(geometry.crossingCount).toBe(0);
  expect(geometry.scrollOverflow).toBe(false);
});

test('the layout switches when the screen is unfolded without losing what you were doing', async ({
  budgetApp,
}) => {
  await budgetApp.foldScreen();
  await budgetApp.openOn('2026-11-05');

  await budgetApp.quickNoteField.fill('Save $300 for holiday travel');
  await expect(budgetApp.singleColumnRegion).toBeVisible();

  await budgetApp.unfoldScreen();

  await expect(budgetApp.twoPaneRegion).toBeVisible();
  await expect(budgetApp.quickNoteField).toHaveValue('Save $300 for holiday travel');
});

test('the header lets you reach Insights and Settings and come back', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');

  await budgetApp.openInsights();
  await expect(budgetApp.page.getByRole('heading', { name: 'Insights' })).toBeVisible();

  await budgetApp.openSettings();
  await expect(budgetApp.page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await budgetApp.returnToBudget();
  await expect(budgetApp.page.getByText('Current budget')).toBeVisible();
});

test('content stays clear of the notch and home indicator (safe areas are respected)', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.simulateSafeAreas({ top: 48, right: 16, bottom: 34, left: 16 });

  const paddings = await budgetApp.page.evaluate(() => {
    const shell = document.querySelector('.sb-shell');
    if (!shell) {
      return { top: 0, bottom: 0 };
    }
    const style = window.getComputedStyle(shell);
    return {
      top: Number.parseFloat(style.paddingTop),
      bottom: Number.parseFloat(style.paddingBottom),
    };
  });

  expect(paddings.top).toBeGreaterThanOrEqual(48);
  expect(paddings.bottom).toBeGreaterThanOrEqual(34);
});

test('amounts are read aloud with their sign', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');

  await expect(budgetApp.page.getByLabel('plus $5,000.00')).toHaveText('+$5,000.00');
  await expect(budgetApp.page.getByLabel('minus $1,800.00')).toHaveText('−$1,800.00');
  await expect(budgetApp.page.getByLabel('minus $120.00')).toHaveText('−$120.00');
});

test('the debug layout overlay shows the screen size when ?debug=layout is in the address', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05', { query: 'debug=layout' });

  await expect(budgetApp.debugLayoutOverlay).toBeVisible();
  const size = budgetApp.page.viewportSize();
  await expect(budgetApp.debugLayoutOverlay).toContainText(
    `${String(size?.width ?? 0)}×${String(size?.height ?? 0)}`,
  );

  const axeResults = await new AxeBuilder({ page: budgetApp.page }).analyze();
  expect(axeResults.violations).toEqual([]);
});
