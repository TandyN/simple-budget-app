import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../support/budget-app';

test('when folded, everything fits on one screen with the add buttons at the top', async ({
  budgetApp,
}) => {
  await budgetApp.foldScreen();
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [
      { name: 'Rent', amount: '$1,800.00' },
      { name: 'Phone', amount: '$60.00' },
    ],
  });
  for (const name of ['One', 'Two', 'Three']) {
    await budgetApp.addExpense({ name, amount: '$1.00' });
  }

  await expect(budgetApp.singleColumnRegion).toBeVisible();
  await expect(budgetApp.twoPaneRegion).toHaveCount(0);
  await expect(budgetApp.actionBar).toBeVisible();
  await expect(budgetApp.page.getByRole('button', { name: 'Add expense' })).toHaveText('−');
  await expect(budgetApp.page.getByRole('button', { name: 'Add deposit' })).toHaveText('+');

  const page = await budgetApp.page.evaluate(() => ({
    needsVerticalScroll:
      document.documentElement.scrollHeight > document.documentElement.clientHeight,
    needsHorizontalScroll:
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  expect(page.needsVerticalScroll).toBe(false);
  expect(page.needsHorizontalScroll).toBe(false);
});

test('the activity box keeps the same height whether it has a few lines or many (nothing moves)', async ({
  budgetApp,
}) => {
  await budgetApp.foldScreen();
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  // A few lines: the plan's two recurring lines only.
  const heightWithFewLines = await budgetApp.activityCardHeight();

  // Many lines: enough to push the activity into a second page.
  for (const name of ['One', 'Two', 'Three', 'Four', 'Five', 'Six']) {
    await budgetApp.addExpense({ name, amount: '$1.00' });
  }
  await expect(budgetApp.page.getByText(/Page 1 of \d+/)).toBeVisible();

  const heightWithManyLines = await budgetApp.activityCardHeight();

  // The card fills the remaining screen space either way, so it does not shrink
  // and nothing on the screen moves as you log.
  expect(heightWithManyLines).toBeGreaterThan(0);
  expect(heightWithFewLines).toBe(heightWithManyLines);
});

test('unfolded, the activity pane fills the screen and never needs scrolling', async ({
  budgetApp,
}) => {
  await budgetApp.unfoldScreen();
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });
  // Plenty of lines: enough to fill many pages and would overflow a content-sized box.
  for (const name of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']) {
    await budgetApp.addExpense({ name, amount: '$1.00' });
  }

  // The activity card fills its pane (tall), the whole app fits the screen, and
  // only the row list scrolls internally if it ever must.
  const height = await budgetApp.activityCardHeight();
  expect(height).toBeGreaterThan(400);
  expect(await budgetApp.needsVerticalScroll()).toBe(false);
});

test('the top bar stays in place while the page scrolls', async ({ budgetApp }) => {
  await budgetApp.foldScreen();
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({ monthlyIncome: '$5,000.00' });

  await budgetApp.page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main');
    if (main) {
      main.style.minHeight = '3000px';
    }
    window.scrollTo(0, 800);
  });

  const headerTop = await budgetApp.page.evaluate(
    () => document.querySelector('header')?.getBoundingClientRect().top ?? -1,
  );
  expect(headerTop).toBe(0);
});

test('when unfolded, the app shows two panes split at the hinge with nothing crossing the center line', async ({
  budgetApp,
}) => {
  await budgetApp.unfoldScreen();
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

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
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });
  await budgetApp.addExpense({ name: 'Groceries', amount: '$120.00' });
  await expect(budgetApp.singleColumnRegion).toBeVisible();

  await budgetApp.unfoldScreen();

  await expect(budgetApp.twoPaneRegion).toBeVisible();
  await expect(budgetApp.ledger.getByRole('button', { name: /Groceries/ })).toBeVisible();
  await expect(budgetApp.currentBudget).toHaveText('$3,080.00');
});

test('folding and unfolding again and again, then reopening, always ends in two panes when unfolded', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({ monthlyIncome: '$5,000.00' });

  for (let round = 0; round < 3; round += 1) {
    await budgetApp.foldScreen();
    await expect(budgetApp.singleColumnRegion).toBeVisible();
    await budgetApp.unfoldScreen();
    await expect(budgetApp.twoPaneRegion).toBeVisible();
  }

  await budgetApp.reopenApp();
  await expect(budgetApp.twoPaneRegion).toBeVisible();
});

test('the header lets you reach Insights and Settings and come back', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
  });

  await budgetApp.openInsights();
  await expect(budgetApp.page.getByRole('heading', { name: 'Insights' })).toBeVisible();

  await budgetApp.openSettings();
  await expect(budgetApp.page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await budgetApp.returnToBudget();
  await expect(budgetApp.page.getByText('Available funds')).toBeVisible();
});

test('content stays clear of the notch and home indicator (safe areas are respected)', async ({
  budgetApp,
}) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.simulateSafeAreas({ top: 48, right: 16, bottom: 34, left: 16 });

  const paddings = await budgetApp.page.evaluate(() => {
    // The top inset lives on the sticky header so it stays clear of the notch while scrolling.
    const header = document.querySelector('.sb-header');
    const shell = document.querySelector('.sb-shell');
    if (!shell || !header) {
      return { top: 0, bottom: 0 };
    }
    return {
      top: Number.parseFloat(window.getComputedStyle(header).paddingTop),
      bottom: Number.parseFloat(window.getComputedStyle(shell).paddingBottom),
    };
  });

  expect(paddings.top).toBeGreaterThanOrEqual(48);
  expect(paddings.bottom).toBeGreaterThanOrEqual(34);
});

test('amounts are read aloud with their sign', async ({ budgetApp }) => {
  await budgetApp.openOn('2026-11-05');
  await budgetApp.finishSetup({
    monthlyIncome: '$5,000.00',
    recurringExpenses: [{ name: 'Rent', amount: '$1,800.00' }],
  });

  await expect(budgetApp.page.getByLabel('plus $5,000.00')).toHaveText('+$5,000.00');
  await expect(budgetApp.page.getByLabel('minus $1,800.00')).toHaveText('−$1,800.00');
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
