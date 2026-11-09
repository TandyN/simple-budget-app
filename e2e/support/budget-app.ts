import { test as base, expect as baseExpect, type Locator, type Page } from '@playwright/test';

export interface SetupRecurringExpenseDraft {
  readonly name: string;
  readonly amount: string;
}

export interface FinishSetupOptions {
  readonly monthlyIncome: string;
  readonly recurringExpenses?: readonly SetupRecurringExpenseDraft[];
}

export interface ManualEntryDraft {
  readonly name?: string;
  readonly amount: string;
  readonly date?: string;
  /** 24-hour local time like `13:15`; turns on the "Set time" toggle. */
  readonly time?: string;
  readonly note?: string;
}

export interface EditEntryChanges {
  readonly name?: string;
  readonly amount?: string;
  readonly date?: string;
  readonly time?: string;
  readonly note?: string;
}

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
  readonly budgetButton: Locator;
  readonly debugLayoutOverlay: Locator;
  readonly currentBudget: Locator;
  readonly ledger: Locator;
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
    this.budgetButton = page.getByRole('button', { name: 'Budget' });
    this.debugLayoutOverlay = page.getByRole('region', { name: 'Debug layout overlay' });
    this.currentBudget = page
      .getByRole('region', { name: 'Available funds summary' })
      .locator('[data-current-budget="true"] output');
    this.ledger = page.getByRole('region', { name: 'Month ledger' });
  }

  async openOn(isoDate: string, options: { readonly query?: string } = {}): Promise<void> {
    await this.page.clock.install({ time: new Date(`${isoDate}T09:00:00-08:00`) });
    const suffix = options.query ? `?${options.query.replace(/^\?/, '')}` : '';
    await this.page.goto(`/${suffix}`);
  }

  async finishSetup(options: FinishSetupOptions): Promise<void> {
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByLabel('Monthly income').fill(options.monthlyIncome);
    await this.page.getByRole('button', { name: 'Continue' }).click();

    for (const expense of options.recurringExpenses ?? []) {
      await this.page.getByLabel('Expense name').fill(expense.name);
      await this.page.getByLabel('Expense amount').fill(expense.amount);
      await this.page.getByRole('button', { name: 'Add recurring expense' }).click();
    }

    await this.page.getByRole('button', { name: 'Review plan' }).click();
    await this.page.getByRole('button', { name: 'Start budgeting' }).click();

    // Wait for the budget screen to take over before the test reads it,
    // so the setup summary (which shows the same amounts) is out of the DOM.
    await this.page.getByRole('region', { name: 'Available funds summary' }).waitFor();
  }

  async addExpense(entry: ManualEntryDraft): Promise<void> {
    await this.page.getByRole('button', { name: 'Add expense' }).click();
    await this.fillAndSaveEntrySheet(entry);
  }

  async addDeposit(entry: ManualEntryDraft): Promise<void> {
    await this.page.getByRole('button', { name: 'Add deposit' }).click();
    await this.fillAndSaveEntrySheet(entry);
  }

  async editEntry(name: string, changes: EditEntryChanges): Promise<void> {
    await this.ledger
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    const dialog = this.page.getByRole('dialog');
    if (changes.amount !== undefined) {
      await dialog.getByLabel('Amount').fill(changes.amount);
    }
    if (changes.name !== undefined) {
      await dialog.getByLabel('Description').fill(changes.name);
    }
    if (changes.date !== undefined) {
      await dialog.getByLabel('Date').fill(changes.date);
    }
    if (changes.time !== undefined) {
      await dialog.getByLabel('Set time').check();
      await dialog.getByLabel('Time', { exact: true }).fill(changes.time);
    }
    if (changes.note !== undefined) {
      const addNoteBtn = dialog.getByRole('button', { name: 'Add note' });
      if ((await addNoteBtn.count()) > 0) {
        await addNoteBtn.click();
      }
      await dialog.getByLabel('Note').fill(changes.note);
    }
    await dialog.getByRole('button', { name: 'Save' }).click();
  }

  async deleteEntry(name: string): Promise<void> {
    await this.ledger
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete' }).click();
  }

  async undo(): Promise<void> {
    await this.page.getByRole('button', { name: 'Undo' }).click();
  }

  /** Pixel height of the activity card, so tests can prove it stays uniform. */
  async activityCardHeight(): Promise<number> {
    return this.page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.sb-activity-card');
      return card ? Math.round(card.getBoundingClientRect().height) : 0;
    });
  }

  /** Whether the whole app needs to scroll vertically (it should not). */
  async needsVerticalScroll(): Promise<boolean> {
    return this.page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    );
  }

  private async fillAndSaveEntrySheet(entry: ManualEntryDraft): Promise<void> {
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Amount').fill(entry.amount);
    if (entry.name !== undefined) {
      await dialog.getByLabel('Description').fill(entry.name);
    }
    if (entry.date !== undefined) {
      await dialog.getByLabel('Date').fill(entry.date);
    }
    if (entry.time !== undefined) {
      await dialog.getByLabel('Set time').check();
      await dialog.getByLabel('Time', { exact: true }).fill(entry.time);
    }
    if (entry.note !== undefined) {
      await dialog.getByRole('button', { name: 'Add note' }).click();
      await dialog.getByLabel('Note').fill(entry.note);
    }
    await dialog.getByRole('button', { name: 'Save' }).click();
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
    await this.budgetButton.click();
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
      baseExpect(cacheVerified).toBe(true);
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

export const expect = baseExpect.extend({
  async toShowLines(ledgerLocator: Locator, expectedLines: readonly (readonly [string, string])[]) {
    let actualLines: [string, string][] = [];
    let pass = false;

    try {
      await baseExpect
        .poll(
          async () => {
            actualLines = await ledgerLocator.evaluate((ledgerEl) => {
              const rows = Array.from(ledgerEl.querySelectorAll('[data-ledger-row="true"]'));
              return rows.map((row) => {
                const label =
                  row.querySelector('[data-ledger-label="true"]')?.textContent?.trim() ?? '';
                const amount =
                  row.querySelector('[data-ledger-amount="true"]')?.textContent?.trim() ?? '';
                return [label, amount] as [string, string];
              });
            });
            return actualLines;
          },
          { timeout: 5000 },
        )
        .toEqual(expectedLines.map(([label, amount]) => [label, amount]));
      pass = true;
    } catch {
      pass = false;
    }

    return {
      pass,
      message: () =>
        `Expected ledger lines:\n${JSON.stringify(expectedLines, null, 2)}\nReceived:\n${JSON.stringify(actualLines, null, 2)}`,
    };
  },
});

interface BudgetAppFixtures {
  budgetApp: BudgetAppDriver;
}

export const test = base.extend<BudgetAppFixtures>({
  budgetApp: async ({ page }, use) => {
    await use(new BudgetAppDriver(page));
  },
});
