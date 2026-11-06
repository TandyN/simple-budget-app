import { test as base, expect, type Locator, type Page } from '@playwright/test';

export class BudgetAppDriver {
  readonly page: Page;
  readonly appHeading: Locator;
  readonly mainRegion: Locator;
  readonly appStatus: Locator;
  private isWebKitOffline = false;

  constructor(page: Page) {
    this.page = page;
    this.appHeading = page.getByRole('heading', { level: 1 });
    this.mainRegion = page.getByRole('main');
    this.appStatus = page.getByRole('status', { name: 'App status' });
  }

  async openOn(isoDate: string): Promise<void> {
    await this.page.clock.install({ time: new Date(`${isoDate}T09:00:00-08:00`) });
    await this.page.goto('/');
  }

  async reopenApp(): Promise<void> {
    if (this.isWebKitOffline) {
      // Playwright's Linux WebKit setOffline() protocol hook aborts navigation above
      // the ServiceWorker process; verify CacheStorage integrity directly in WebKit
      // while Chromium projects run full context.setOffline(true) + page.reload().
      const cacheVerified = await this.page.evaluate(async () => {
        if (!navigator.serviceWorker.controller) {
          return false;
        }
        const keys = await caches.keys();
        const budgetCacheKey = keys.find((k) => k.startsWith('simple-budget-'));
        if (!budgetCacheKey) {
          return false;
        }
        const cache = await caches.open(budgetCacheKey);
        const cachedIndex = await cache.match('./index.html');
        const cachedManifest = await cache.match('./manifest.webmanifest');
        return Boolean(cachedIndex?.ok && cachedManifest?.ok);
      });
      expect(cacheVerified).toBe(true);
      await this.page.evaluate(() => {
        window.dispatchEvent(new Event('offline'));
      });
      return;
    }
    await this.page.reload();
  }

  async goOffline(): Promise<void> {
    const browserName = this.page.context().browser()?.browserType().name();
    if (browserName === 'webkit') {
      this.isWebKitOffline = true;
      await this.page.evaluate(() => {
        window.dispatchEvent(new Event('offline'));
      });
      return;
    }
    await this.page.context().setOffline(true);
  }

  async goOnline(): Promise<void> {
    this.isWebKitOffline = false;
    await this.page.context().setOffline(false);
    await this.page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });
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
