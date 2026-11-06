import { test as base, expect, type Locator, type Page } from '@playwright/test';

export class BudgetAppDriver {
  readonly page: Page;
  readonly appHeading: Locator;
  readonly mainRegion: Locator;

  constructor(page: Page) {
    this.page = page;
    this.appHeading = page.getByRole('heading', { level: 1 });
    this.mainRegion = page.getByRole('main');
  }

  async openOn(isoDate: string): Promise<void> {
    await this.page.clock.install({ time: new Date(`${isoDate}T09:00:00-08:00`) });
    await this.page.goto('/');
  }

  async reopenApp(): Promise<void> {
    await this.page.reload();
  }
}

interface BudgetAppFixtures {
  budgetApp: BudgetAppDriver;
}

export const test = base.extend<BudgetAppFixtures>({
  budgetApp: async ({ page }, use) => {
    await use(new BudgetAppDriver(page));
  },
});

export { expect };
