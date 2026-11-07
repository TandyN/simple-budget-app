import { test as base, expect, type Locator, type Page } from '@playwright/test';

export class BudgetAppDriver {
  readonly page: Page;
  readonly appHeading: Locator;
  readonly mainRegion: Locator;
  readonly appStatus: Locator;
  readonly singleColumnRegion: Locator;
  readonly twoPaneRegion: Locator;
  readonly overviewPane: Locator;
  readonly ledgerPane: Locator;
  readonly actionBar: Locator;
  readonly insightsButton: Locator;
  readonly settingsButton: Locator;
  readonly backToBudgetButton: Locator;
  readonly debugLayoutOverlay: Locator;
  readonly quickNoteField: Locator;
  private isWebKitOffline = false;

  constructor(page: Page) {
    this.page = page;
    this.appHeading = page.getByRole('heading', { level: 1 });
    this.mainRegion = page.getByRole('main');
    this.appStatus = page.getByRole('status', { name: 'App status' });
    this.singleColumnRegion = page.getByRole('region', { name: 'Single column layout' });
    this.twoPaneRegion = page.getByRole('region', { name: 'Two-pane split layout' });
    this.overviewPane = page.getByRole('region', { name: 'Overview pane' });
    this.ledgerPane = page.getByRole('region', { name: 'Ledger pane' });
    this.actionBar = page.getByRole('toolbar', { name: 'Budget actions' });
    this.insightsButton = page.getByRole('button', { name: 'Insights' });
    this.settingsButton = page.getByRole('button', { name: 'Settings' });
    this.backToBudgetButton = page.getByRole('button', { name: 'Back to budget' });
    this.debugLayoutOverlay = page.getByRole('region', { name: 'Debug layout overlay' });
    this.quickNoteField = page.getByRole('textbox', { name: 'Quick note' });
  }

  async openOn(isoDate: string, options: { readonly query?: string } = {}): Promise<void> {
    await this.page.clock.install({ time: new Date(`${isoDate}T09:00:00-08:00`) });
    const suffix = options.query ? `?${options.query.replace(/^\?/, '')}` : '';
    await this.page.goto(`/${suffix}`);
  }

  async foldScreen(): Promise<void> {
    await this.page.setViewportSize({ width: 466, height: 678 });
  }

  async unfoldScreen(): Promise<void> {
    await this.page.setViewportSize({ width: 626, height: 890 });
  }

  async openInsights(): Promise<void> {
    await this.insightsButton.click();
  }

  async openSettings(): Promise<void> {
    await this.settingsButton.click();
  }

  async returnToBudget(): Promise<void> {
    await this.backToBudgetButton.click();
  }

  async simulateSafeAreas(insets: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  }): Promise<void> {
    await this.page.evaluate((values) => {
      const root = document.documentElement;
      root.style.setProperty('--safe-area-top', `${String(values.top)}px`);
      root.style.setProperty('--safe-area-right', `${String(values.right)}px`);
      root.style.setProperty('--safe-area-bottom', `${String(values.bottom)}px`);
      root.style.setProperty('--safe-area-left', `${String(values.left)}px`);
    }, insets);
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

  async simulateStaleCachedHtmlFromPreviousRelease(): Promise<void> {
    await this.page.evaluate(async () => {
      const keys = await caches.keys();
      const budgetCacheKey = keys.find((k) => k.startsWith('simple-budget-'));
      if (!budgetCacheKey) {
        return;
      }
      const cache = await caches.open(budgetCacheKey);
      const staleHtml = [
        '<!doctype html>',
        '<html><head><title>Simple Budget</title></head>',
        '<body><div id="root"></div>',
        '<script type="module" crossorigin src="./assets/index-stale000.js"></script>',
        '</body></html>',
      ].join('');
      const response = new Response(staleHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      await cache.put('./index.html', response.clone());
      await cache.put('./', response);
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
