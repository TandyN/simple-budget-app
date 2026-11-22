import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import {
  assertTouchTargetGeometry,
  assertZeroAxeViolations,
  assertZeroViewportOverflow,
  expect,
  test,
} from "./fixtures";

/**
 * Deterministic mid-month UTC instant so monthly recurring rules with
 * `dayOfMonth: 1` (due at `YYYY-MM-01T12:00:00.000Z`) are always past due
 * regardless of the real calendar date/hour when tests execute.
 */
const FIXED_TEST_TIME = new Date("2026-07-15T14:00:00.000Z");

const IMG_XSS_PAYLOAD = "<img src=x onerror=window.__xss=1>";
const SCRIPT_XSS_PAYLOAD = "<script>window.__xss=1</script>";

/**
 * Reads the UTF-8 contents of a Playwright `Download` artifact.
 */
async function readDownloadText(download: Download): Promise<string> {
  const filePath = await download.path();
  expect(
    filePath,
    `Expected download "${download.suggestedFilename()}" to produce a local file path`,
  ).not.toBeNull();
  return readFile(filePath as string, "utf8");
}

/**
 * Adds a manual activity on the Budget tab via the Quick Add form.
 */
async function addManualActivity(
  page: Page,
  options: {
    type: "expense" | "income" | "deposit";
    amount: string;
    memo: string;
    tags: string;
  },
): Promise<void> {
  await page.locator("#quick-add-type").selectOption(options.type);
  await page.locator("#quick-add-amount").fill(options.amount);
  await page.locator("#quick-add-memo").fill(options.memo);
  await page.locator("#quick-add-tags").fill(options.tags);
  await page.getByRole("button", { name: "Add Activity" }).click();
}

test.describe("Phase 4C Insights & Settings tabs, backup/restore, multi-tab sync & WCAG/viewport gates", () => {
  test.beforeEach(async ({ context }) => {
    // Route `PlatformServices.saveBackup` through the deterministic `<a download>`
    // Blob path on Chromium as well as WebKit: headless Chromium's native
    // `showSaveFilePicker` cannot be dismissed by Playwright on unfolded
    // viewports and emits a `< 400px` window-size console warning on folded
    // mobile viewports (`375x667`, `390x844`).
    await context.addInitScript(() => {
      delete (window as unknown as { showSaveFilePicker?: unknown })
        .showSaveFilePicker;
    });
  });

  test("Insights tab: distinct empty states, searchActivities filters (since/until, tag, type, keyword), tag & period rollups (OQ-2 Activity.period), and filter reset", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const insightsTab = page.getByRole("tab", { name: "Insights" });
    const budgetTab = page.getByRole("tab", { name: "Budget" });

    // 1. Cold-start empty state on Insights tab ("no-data").
    await insightsTab.click();
    await expect(page.locator("#panel-insights")).toBeVisible();
    await expect(page.locator("#insights-summary-in")).toHaveText("$0.00");
    await expect(page.locator("#insights-summary-out")).toHaveText("$0.00");
    await expect(page.locator("#insights-summary-net")).toHaveText("$0.00");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "0 matching activities",
    );
    await expect(page.locator("#insights-empty-state")).toBeVisible();
    await expect(page.locator("#insights-empty-state")).toHaveAttribute(
      "data-empty-kind",
      "no-data",
    );
    await expect(page.locator("#insights-activity-list")).toBeHidden();
    await expect(page.locator("#insights-tag-rollups")).toBeHidden();
    await expect(page.locator("#insights-period-rollups")).toBeHidden();

    // 2. Seed recurring + manual activities across dates & tags on Budget tab.
    await budgetTab.click();
    const budgetPanel = page.locator("#panel-budget");
    const fundsEl = page.locator("#budget-available-funds");

    // Recurring monthly income ($2,000.00, period: "2026-07").
    await budgetPanel.locator("summary.budget-recurring-summary").click();
    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("2000.00");
    await page.locator("#recurring-add-name").fill("Monthly Salary");
    await page.locator("#recurring-add-day").fill("1");
    await budgetPanel.getByRole("button", { name: "Add Rule" }).click();
    await expect(fundsEl).toHaveText("$2,000.00");
    await budgetPanel.locator("summary.budget-recurring-summary").click();

    // Edit the auto-posted recurring activity: backdate dateTime into June
    // (`2026-06-15T12:00`) and add tag "payroll". Under OQ-2, `summarizeByPeriod`
    // must still attribute it to `Activity.period` ("2026-07"), NOT "2026-06".
    const recurringFeedItem = page
      .locator(".budget-feed-item")
      .filter({ hasText: "Recurring" });
    await recurringFeedItem.getByRole("button", { name: /Edit/ }).click();
    const editDialog = page.locator("dialog.budget-edit-dialog");
    await expect(editDialog).toBeVisible();
    await page.locator("#edit-activity-datetime").fill("2026-06-15T12:00");
    await page.locator("#edit-activity-tags").fill("payroll");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(editDialog).toBeHidden();

    // Manual deposit ($250.50), backdated to May 2026 (`2026-05-10T10:00`).
    await addManualActivity(page, {
      type: "deposit",
      amount: "250.50",
      memo: "Reserve deposit",
      tags: "savings, reserve",
    });
    await expect(fundsEl).toHaveText("$2,250.50");
    const depositItem = page
      .locator(".budget-feed-item")
      .filter({ hasText: "Reserve deposit" });
    await depositItem.getByRole("button", { name: /Edit/ }).click();
    await expect(editDialog).toBeVisible();
    await page.locator("#edit-activity-datetime").fill("2026-05-10T10:00");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(editDialog).toBeHidden();

    // Manual income ($100.25) on 2026-07-15.
    await addManualActivity(page, {
      type: "income",
      amount: "100.25",
      memo: "Freelance design",
      tags: "side-gig, savings",
    });
    await expect(fundsEl).toHaveText("$2,350.75");

    // Manual expense ($45.75) on 2026-07-15.
    await addManualActivity(page, {
      type: "expense",
      amount: "45.75",
      memo: "Weekly groceries",
      tags: "groceries, essentials",
    });
    await expect(fundsEl).toHaveText("$2,305.00");

    // 3. Switch to Insights tab and verify unfiltered summary, tag rollups,
    // and OQ-2 period rollups.
    await insightsTab.click();
    await expect(page.locator("#insights-summary-in")).toHaveText("$2,350.75");
    await expect(page.locator("#insights-summary-out")).toHaveText("$45.75");
    await expect(page.locator("#insights-summary-net")).toHaveText("$2,305.00");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "4 matching activities",
    );
    await expect(page.locator("#insights-activity-list")).toBeVisible();
    await expect(page.locator(".insights-activity-item")).toHaveCount(4);

    // Tag rollups (`summarizeByTag`).
    const savingsTagRow = page.locator(
      '#insights-tag-rollups .insights-rollup-item[data-tag="savings"]',
    );
    await expect(savingsTagRow).toContainText("In: $350.75");
    await expect(savingsTagRow).toContainText("Out: $0.00");
    await expect(savingsTagRow).toContainText("Net: $350.75");

    const groceriesTagRow = page.locator(
      '#insights-tag-rollups .insights-rollup-item[data-tag="groceries"]',
    );
    await expect(groceriesTagRow).toContainText("In: $0.00");
    await expect(groceriesTagRow).toContainText("Out: $45.75");
    await expect(groceriesTagRow).toContainText("Net: -$45.75");

    const payrollTagRow = page.locator(
      '#insights-tag-rollups .insights-rollup-item[data-tag="payroll"]',
    );
    await expect(payrollTagRow).toContainText("In: $2,000.00");

    // Period rollups (`summarizeByPeriod`, honoring `Activity.period` for recurring).
    const julyPeriod = page.locator(
      '#insights-period-rollups .insights-period-item[data-period="2026-07"]',
    );
    await expect(julyPeriod).toContainText("In: $2,100.25");
    await expect(julyPeriod).toContainText("Out: $45.75");
    await expect(julyPeriod).toContainText("Net: $2,054.50");

    const mayPeriod = page.locator(
      '#insights-period-rollups .insights-period-item[data-period="2026-05"]',
    );
    await expect(mayPeriod).toContainText("In: $250.50");
    await expect(mayPeriod).toContainText("Out: $0.00");
    await expect(mayPeriod).toContainText("Net: $250.50");

    await expect(
      page.locator(
        '#insights-period-rollups .insights-period-item[data-period="2026-06"]',
      ),
    ).toHaveCount(0);

    // 4. Filter by date range (`since` / `until`): May 2026 only.
    await page.locator("#insights-filter-since").fill("2026-05-01");
    await page.locator("#insights-filter-until").fill("2026-05-31");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "1 matching activity",
    );
    await expect(page.locator("#insights-summary-in")).toHaveText("$250.50");
    await expect(page.locator("#insights-summary-out")).toHaveText("$0.00");
    await expect(page.locator("#insights-summary-net")).toHaveText("$250.50");
    await expect(page.locator(".insights-activity-item")).toHaveCount(1);
    await expect(page.locator("#insights-activity-list")).toContainText(
      "Reserve deposit",
    );

    // Invalid date range (`since > until`) displays role="alert" error.
    await page.locator("#insights-filter-since").fill("2026-07-20");
    await page.locator("#insights-filter-until").fill("2026-07-01");
    await expect(page.locator("#insights-filter-error")).toBeVisible();
    await expect(page.locator("#insights-filter-error")).toHaveAttribute(
      "role",
      "alert",
    );

    // Reset Filters restores all 4 activities and clears error.
    await page.locator("#insights-filter-reset").click();
    await expect(page.locator("#insights-filter-error")).toBeHidden();
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "4 matching activities",
    );

    // 5. Filter by Tag ("savings") -> 2 activities ($350.75).
    await page.locator("#insights-filter-tag").selectOption("savings");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "2 matching activities",
    );
    await expect(page.locator("#insights-summary-in")).toHaveText("$350.75");
    await expect(page.locator("#insights-summary-net")).toHaveText("$350.75");

    // Combine Tag ("savings") + Type ("expense") -> distinct "no-matches" empty state.
    await page.locator("#insights-filter-type").selectOption("expense");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "0 matching activities",
    );
    await expect(page.locator("#insights-empty-state")).toBeVisible();
    await expect(page.locator("#insights-empty-state")).toHaveAttribute(
      "data-empty-kind",
      "no-matches",
    );
    await expect(page.locator("#insights-activity-list")).toBeHidden();

    // Reset and filter by Type ("expense") alone.
    await page.locator("#insights-filter-reset").click();
    await page.locator("#insights-filter-type").selectOption("expense");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "1 matching activity",
    );
    await expect(page.locator("#insights-summary-out")).toHaveText("$45.75");
    await expect(page.locator("#insights-summary-net")).toHaveText("-$45.75");
    await expect(page.locator("#insights-activity-list")).toContainText(
      "Weekly groceries",
    );

    // Reset and filter by case-insensitive Keyword ("FREELANCE").
    await page.locator("#insights-filter-reset").click();
    await page.locator("#insights-filter-keyword").fill("FREELANCE");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "1 matching activity",
    );
    await expect(page.locator("#insights-activity-list")).toContainText(
      "Freelance design",
    );

    // Final Reset clears inputs and restores full unfiltered dataset.
    await page.locator("#insights-filter-reset").click();
    await expect(page.locator("#insights-filter-since")).toHaveValue("");
    await expect(page.locator("#insights-filter-until")).toHaveValue("");
    await expect(page.locator("#insights-filter-tag")).toHaveValue("");
    await expect(page.locator("#insights-filter-type")).toHaveValue("");
    await expect(page.locator("#insights-filter-keyword")).toHaveValue("");
    await expect(page.locator("#insights-summary-count")).toHaveText(
      "4 matching activities",
    );
  });

  test("Settings tab: storage durability readout, iOS guidance, backup-age nag, and recurring rules sync with Budget", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const settingsTab = page.getByRole("tab", { name: "Settings" });
    const budgetTab = page.getByRole("tab", { name: "Budget" });
    const settingsPanel = page.locator("#panel-settings");
    const budgetPanel = page.locator("#panel-budget");

    // 1. Cold-start Settings state: durability badge, guidance, "Never backed up", no nag yet.
    await settingsTab.click();
    await expect(settingsPanel).toBeVisible();

    const durabilityStatus = page.locator("#settings-durability-status");
    await expect(durabilityStatus).toBeVisible();
    const persistedAttr = await durabilityStatus.getAttribute("data-persisted");
    expect(persistedAttr === "true" || persistedAttr === "false").toBe(true);

    const durabilityGuidance = page.locator("#settings-durability-guidance");
    await expect(durabilityGuidance).toBeVisible();
    if (persistedAttr === "false") {
      await expect(durabilityStatus).toHaveText("Best-effort browser storage");
      await expect(durabilityGuidance).toContainText("iOS Safari");
    } else {
      await expect(durabilityStatus).toHaveText("Persistent storage granted");
    }

    await expect(page.locator("#settings-last-backup")).toHaveText(
      "Never backed up",
    );
    await expect(page.locator("#settings-backup-nag")).toBeHidden();

    // 2. Add a recurring expense rule from Settings and verify backup nag + Budget sync.
    await settingsPanel.locator("summary.budget-recurring-summary").click();
    await page.locator("#settings-recurring-add-type").selectOption("expense");
    await page.locator("#settings-recurring-add-amount").fill("15.00");
    await page.locator("#settings-recurring-add-name").fill("Cloud Storage");
    await page.locator("#settings-recurring-add-day").fill("1");
    await settingsPanel.getByRole("button", { name: "Add Rule" }).click();

    const settingsRuleItems = settingsPanel.locator(".budget-recurring-item");
    await expect(settingsRuleItems).toHaveCount(1);
    await expect(settingsRuleItems.first()).toContainText("Cloud Storage");
    await expect(settingsRuleItems.first()).toContainText("$15.00");
    await expect(settingsRuleItems.first()).toContainText("Active");
    await expect(settingsPanel.locator(".budget-recurring-count")).toHaveText(
      "1",
    );

    // Backup-age nag appears because local data exists with lastBackupAt === null.
    await expect(page.locator("#settings-backup-nag")).toBeVisible();
    await expect(page.locator("#settings-backup-nag")).toHaveAttribute(
      "data-nag-reason",
      "never",
    );
    await expect(page.locator("#settings-nag-export-btn")).toBeVisible();

    // Verify Budget tab reflects the recurring rule and auto-posted activity.
    await budgetTab.click();
    await expect(page.locator("#budget-available-funds")).toHaveText("-$15.00");
    await expect(page.locator(".budget-feed-item")).toHaveCount(1);
    await expect(budgetPanel.locator(".budget-recurring-count")).toHaveText(
      "1",
    );

    // Pause rule in Settings and verify Budget tab stays in sync.
    await settingsTab.click();
    await settingsRuleItems
      .first()
      .getByRole("button", { name: /Pause/ })
      .click();
    await expect(settingsRuleItems.first()).toContainText("Paused");

    await budgetTab.click();
    await budgetPanel.locator("summary.budget-recurring-summary").click();
    await expect(
      budgetPanel.locator(".budget-recurring-item").first(),
    ).toContainText("Paused");
  });

  test("Settings tab: hardened JSON backup export, invalid/prototype-polluting/oversized import rejections, confirmation <dialog>, pre-import safety snapshot, and atomic restore across reload", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const budgetTab = page.getByRole("tab", { name: "Budget" });
    const settingsTab = page.getByRole("tab", { name: "Settings" });
    const budgetPanel = page.locator("#panel-budget");
    const fundsEl = page.locator("#budget-available-funds");
    const confirmDialog = page.locator("dialog.confirm-dialog");
    const importInput = page.locator("#settings-import-file");
    const backupError = page.locator("#settings-backup-error");
    const backupStatus = page.locator("#settings-backup-status");

    // 1. Seed initial state: $2,000.00 recurring income - $50.00 manual expense = $1,950.00.
    await budgetPanel.locator("summary.budget-recurring-summary").click();
    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("2000.00");
    await page.locator("#recurring-add-name").fill("Base Salary");
    await page.locator("#recurring-add-day").fill("1");
    await budgetPanel.getByRole("button", { name: "Add Rule" }).click();
    await expect(fundsEl).toHaveText("$2,000.00");
    await budgetPanel.locator("summary.budget-recurring-summary").click();

    await addManualActivity(page, {
      type: "expense",
      amount: "50.00",
      memo: "Groceries",
      tags: "food",
    });
    await expect(fundsEl).toHaveText("$1,950.00");
    await expect(page.locator(".budget-feed-item")).toHaveCount(2);

    // 2. Export a valid JSON backup from Settings and verify lastBackupAt updates.
    await settingsTab.click();
    await expect(page.locator("#settings-last-backup")).toHaveText(
      "Never backed up",
    );
    await expect(page.locator("#settings-backup-nag")).toBeVisible();

    const [exportDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#settings-export-btn").click(),
    ]);
    expect(exportDownload.suggestedFilename()).toBe(
      "simple-budget-backup-2026-07-15.json",
    );
    const validBackupJson = await readDownloadText(exportDownload);
    const parsedBackup = JSON.parse(validBackupJson) as {
      schemaVersion: number;
      rules: unknown[];
      activities: unknown[];
    };
    expect(parsedBackup.schemaVersion).toBe(1);
    expect(parsedBackup.rules).toHaveLength(1);
    expect(parsedBackup.activities).toHaveLength(2);

    await expect(page.locator("#settings-last-backup")).not.toHaveText(
      "Never backed up",
    );
    await expect(page.locator("#settings-last-backup time")).toHaveAttribute(
      "datetime",
      /^\d{4}-\d{2}-\d{2}T/,
    );
    await expect(page.locator("#settings-backup-nag")).toBeHidden();
    await expect(backupStatus).toBeVisible();
    await expect(backupStatus).toContainText("Backup exported");

    // 3a. Reject malformed JSON while keeping existing data 100% intact.
    await importInput.setInputFiles({
      name: "malformed.json",
      mimeType: "application/json",
      buffer: Buffer.from("{not valid json", "utf8"),
    });
    await expect(confirmDialog).toBeVisible();
    const [malformedSnapshot] = await Promise.all([
      page.waitForEvent("download"),
      confirmDialog.getByRole("button", { name: "Import Backup" }).click(),
    ]);
    expect(malformedSnapshot.suggestedFilename()).toMatch(
      /^simple-budget-pre-import-snapshot-.*\.json$/,
    );
    await expect(backupError).toBeVisible();
    await expect(backupError).toHaveAttribute("role", "alert");
    await expect(importInput).toHaveAttribute("aria-invalid", "true");

    // 3b. Reject prototype-polluting JSON while keeping Object.prototype and data intact.
    const protoPayload =
      '{"schemaVersion":1,"exportedAt":"2026-07-15T14:00:00.000Z","rules":[],"activities":[],"__proto__":{"polluted":true}}';
    await importInput.setInputFiles({
      name: "proto-pollute.json",
      mimeType: "application/json",
      buffer: Buffer.from(protoPayload, "utf8"),
    });
    await expect(confirmDialog).toBeVisible();
    const [protoSnapshot] = await Promise.all([
      page.waitForEvent("download"),
      confirmDialog.getByRole("button", { name: "Import Backup" }).click(),
    ]);
    expect(protoSnapshot.suggestedFilename()).toMatch(
      /^simple-budget-pre-import-snapshot-.*\.json$/,
    );
    await expect(backupError).toBeVisible();
    await expect(backupError).toHaveAttribute("role", "alert");
    await expect(importInput).toHaveAttribute("aria-invalid", "true");
    const pollutedValue = await page.evaluate(
      () => ({}) as Record<string, unknown>,
    );
    expect(pollutedValue.polluted).toBeUndefined();

    // 3c. Reject oversized file (> 10,485,760 bytes) via pre-read File.size guard
    // WITHOUT opening the confirmation <dialog>.
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
    await importInput.setInputFiles({
      name: "oversized.json",
      mimeType: "application/json",
      buffer: oversizedBuffer,
    });
    await expect(confirmDialog).toBeHidden();
    await expect(backupError).toBeVisible();
    await expect(backupError).toHaveAttribute("role", "alert");
    await expect(backupError).toContainText("10 MB");
    await expect(importInput).toHaveAttribute("aria-invalid", "true");

    // Verify existing data is 100% intact after all 3 rejected imports.
    await budgetTab.click();
    await expect(fundsEl).toHaveText("$1,950.00");
    await expect(page.locator(".budget-feed-item")).toHaveCount(2);

    // 4. Mutate local state (+$100.00 expense -> $1,850.00), then test valid
    // backup import: Cancel preserves mutated state; Confirm saves safety
    // snapshot and atomically restores $1,950.00 across reload.
    await addManualActivity(page, {
      type: "expense",
      amount: "100.00",
      memo: "Temporary extra spend",
      tags: "misc",
    });
    await expect(fundsEl).toHaveText("$1,850.00");
    await expect(page.locator(".budget-feed-item")).toHaveCount(3);

    await settingsTab.click();

    // Cancel path preserves current mutated state.
    await importInput.setInputFiles({
      name: "valid-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(validBackupJson, "utf8"),
    });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toBeHidden();

    await budgetTab.click();
    await expect(fundsEl).toHaveText("$1,850.00");
    await expect(page.locator(".budget-feed-item")).toHaveCount(3);

    // Confirm path downloads pre-import safety snapshot and restores backup.
    await settingsTab.click();
    await importInput.setInputFiles({
      name: "valid-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(validBackupJson, "utf8"),
    });
    await expect(confirmDialog).toBeVisible();
    const [restoreSnapshot] = await Promise.all([
      page.waitForEvent("download"),
      confirmDialog.getByRole("button", { name: "Import Backup" }).click(),
    ]);
    await expect(confirmDialog).toBeHidden();
    expect(restoreSnapshot.suggestedFilename()).toMatch(
      /^simple-budget-pre-import-snapshot-.*\.json$/,
    );

    const snapshotJson = await readDownloadText(restoreSnapshot);
    const parsedSnapshot = JSON.parse(snapshotJson) as {
      activities: Array<{ memo?: string }>;
    };
    expect(parsedSnapshot.activities).toHaveLength(3);
    expect(
      parsedSnapshot.activities.some((a) => a.memo === "Temporary extra spend"),
    ).toBe(true);

    await expect(backupStatus).toBeVisible();
    await expect(backupStatus).toContainText("Backup imported");

    await budgetTab.click();
    await expect(fundsEl).toHaveText("$1,950.00");
    await expect(page.locator(".budget-feed-item")).toHaveCount(2);
    await expect(page.locator(".budget-feed-list")).not.toContainText(
      "Temporary extra spend",
    );

    // Reload and verify restored state persists in IndexedDB.
    await page.reload();
    await expect(fundsEl).toHaveText("$1,950.00");
    await expect(page.locator(".budget-feed-item")).toHaveCount(2);
    await expect(page.locator(".budget-feed-list")).toContainText("Groceries");
  });

  test("Multi-tab BroadcastChannel live sync updates Budget, Insights, and Settings across peer pages without reload", async ({
    context,
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");
    await expect(page.locator("#budget-available-funds")).toHaveText("$0.00");

    const page2 = await context.newPage();
    try {
      await page2.clock.setSystemTime(FIXED_TEST_TIME);
      await page2.goto("./");
      await expect(page2.locator("#budget-available-funds")).toHaveText(
        "$0.00",
      );

      // 1. Add manual income in Page 1 -> Page 2 Budget tab updates live.
      await addManualActivity(page, {
        type: "income",
        amount: "500.00",
        memo: "Multi-tab income",
        tags: "sync-test",
      });
      await expect(page.locator("#budget-available-funds")).toHaveText(
        "$500.00",
      );
      await expect(page2.locator("#budget-available-funds")).toHaveText(
        "$500.00",
      );
      await expect(page2.locator(".budget-feed-list")).toContainText(
        "Multi-tab income",
      );

      // 2. Switch Page 2 to Insights, add manual expense in Page 1 -> Page 2
      // Insights rollups & matching list update live without reload.
      await page2.getByRole("tab", { name: "Insights" }).click();
      await expect(page2.locator("#insights-summary-in")).toHaveText("$500.00");

      await addManualActivity(page, {
        type: "expense",
        amount: "75.00",
        memo: "Multi-tab expense",
        tags: "sync-test",
      });
      await expect(page2.locator("#insights-summary-in")).toHaveText("$500.00");
      await expect(page2.locator("#insights-summary-out")).toHaveText("$75.00");
      await expect(page2.locator("#insights-summary-net")).toHaveText(
        "$425.00",
      );
      await expect(page2.locator("#insights-activity-list")).toContainText(
        "Multi-tab expense",
      );

      // 3. Switch Page 2 to Settings, export backup in Page 1 -> Page 2
      // Settings updates lastBackupAt & hides backup nag without reload.
      await page2.getByRole("tab", { name: "Settings" }).click();
      await expect(page2.locator("#settings-last-backup")).toHaveText(
        "Never backed up",
      );
      await expect(page2.locator("#settings-backup-nag")).toBeVisible();

      await page.getByRole("tab", { name: "Settings" }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#settings-export-btn").click(),
      ]);
      expect(download.suggestedFilename()).toBe(
        "simple-budget-backup-2026-07-15.json",
      );

      await expect(page2.locator("#settings-last-backup")).not.toHaveText(
        "Never backed up",
      );
      await expect(page2.locator("#settings-backup-nag")).toBeHidden();
    } finally {
      await page2.close();
    }
  });

  test("DOM XSS payloads in Insights rollups/activities and imported JSON backups render strictly as inert text", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const xssBackup = {
      schemaVersion: 1,
      exportedAt: "2026-07-15T14:00:00.000Z",
      rules: [
        {
          id: "rule-xss-1",
          type: "income",
          amountCents: 10000,
          currency: "USD",
          name: IMG_XSS_PAYLOAD,
          schedule: { cadence: "monthly", dayOfMonth: 1 },
          active: true,
          lastPostPeriod: "2026-07",
          createdAt: "2026-07-01T12:00:00.000Z",
          updatedAt: "2026-07-01T12:00:00.000Z",
        },
      ],
      activities: [
        {
          id: "act-xss-1",
          type: "expense",
          amountCents: 2500,
          currency: "USD",
          dateTime: "2026-07-15T12:00:00.000Z",
          source: "manual",
          tags: [IMG_XSS_PAYLOAD, SCRIPT_XSS_PAYLOAD],
          memo: SCRIPT_XSS_PAYLOAD,
          createdAt: "2026-07-15T12:00:00.000Z",
          updatedAt: "2026-07-15T12:00:00.000Z",
        },
      ],
    };

    // Import the XSS-laden backup via Settings.
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.locator("#settings-import-file").setInputFiles({
      name: "xss-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(xssBackup), "utf8"),
    });
    const confirmDialog = page.locator("dialog.confirm-dialog");
    await expect(confirmDialog).toBeVisible();
    await Promise.all([
      page.waitForEvent("download"),
      confirmDialog.getByRole("button", { name: "Import Backup" }).click(),
    ]);
    await expect(confirmDialog).toBeHidden();
    await expect(page.locator("#settings-backup-status")).toContainText(
      "Backup imported",
    );

    // Verify inert rendering on Settings tab.
    const settingsPanel = page.locator("#panel-settings");
    await settingsPanel.locator("summary.budget-recurring-summary").click();
    await expect(settingsPanel.locator(".budget-recurring-name")).toHaveText(
      IMG_XSS_PAYLOAD,
    );
    await expect(settingsPanel.locator("img")).toHaveCount(0);
    await expect(settingsPanel.locator("script")).toHaveCount(0);

    // Verify inert rendering on Insights tab (activities, tag chips, tag rollups, period rollups).
    await page.getByRole("tab", { name: "Insights" }).click();
    const insightsPanel = page.locator("#panel-insights");
    await expect(insightsPanel.locator(".insights-activity-memo")).toHaveText(
      SCRIPT_XSS_PAYLOAD,
    );
    await expect(insightsPanel.locator(".insights-tag-chip")).toHaveText([
      IMG_XSS_PAYLOAD,
      SCRIPT_XSS_PAYLOAD,
    ]);
    await expect(insightsPanel.locator(".insights-rollup-name")).toContainText([
      IMG_XSS_PAYLOAD,
    ]);
    await expect(insightsPanel.locator("img")).toHaveCount(0);
    await expect(insightsPanel.locator("script")).toHaveCount(0);

    const xssMarker = await page.evaluate(
      () => (window as unknown as { __xss?: unknown }).__xss,
    );
    expect(xssMarker).toBeUndefined();
  });

  test("passes WCAG 2.2 AA axe scan, zero-overflow geometry, and >= 44x44 touch targets across populated Insights, Settings, and Import confirmation <dialog>", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const budgetPanel = page.locator("#panel-budget");
    const settingsPanel = page.locator("#panel-settings");

    // Seed data so Insights rollups and Settings backup nag / recurring rules are populated.
    await budgetPanel.locator("summary.budget-recurring-summary").click();
    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("1500.00");
    await page.locator("#recurring-add-name").fill("Monthly Income");
    await page.locator("#recurring-add-day").fill("1");
    await budgetPanel.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.locator("#budget-available-funds")).toHaveText(
      "$1,500.00",
    );
    await budgetPanel.locator("summary.budget-recurring-summary").click();

    await addManualActivity(page, {
      type: "expense",
      amount: "65.00",
      memo: "Market groceries",
      tags: "food, essentials",
    });
    await expect(page.locator("#budget-available-funds")).toHaveText(
      "$1,435.00",
    );

    // 1. Populated Insights tab.
    await page.getByRole("tab", { name: "Insights" }).click();
    await expect(page.locator("#insights-activity-list")).toBeVisible();
    await assertZeroAxeViolations(page, "populated Insights tab");
    await assertZeroViewportOverflow(page, "populated Insights tab");
    await assertTouchTargetGeometry(page, "button:visible");

    // 2. Populated Settings tab (Recurring Rules collapsed, backup nag visible).
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.locator("#settings-backup-nag")).toBeVisible();
    await assertZeroAxeViolations(page, "populated Settings tab");
    await assertZeroViewportOverflow(page, "populated Settings tab");
    await assertTouchTargetGeometry(page, "button:visible");
    await assertTouchTargetGeometry(
      page,
      "#panel-settings summary.budget-recurring-summary",
    );

    // 3. Settings tab with Recurring Rules expanded.
    await settingsPanel.locator("summary.budget-recurring-summary").click();
    await expect(
      settingsPanel.locator("details.budget-recurring-details"),
    ).toHaveAttribute("open", "");
    await assertZeroAxeViolations(
      page,
      "Settings tab with Recurring Rules expanded",
    );
    await assertZeroViewportOverflow(
      page,
      "Settings tab with Recurring Rules expanded",
    );
    await assertTouchTargetGeometry(page, "button:visible");

    // 4. Open Import confirmation <dialog>.
    await page.locator("#settings-import-file").setInputFiles({
      name: "confirm-a11y.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}", "utf8"),
    });
    const confirmDialog = page.locator("dialog.confirm-dialog");
    await expect(confirmDialog).toBeVisible();
    await assertZeroAxeViolations(
      page,
      "Settings Import confirmation <dialog>",
    );
    await assertZeroViewportOverflow(
      page,
      "Settings Import confirmation <dialog>",
    );
    await assertTouchTargetGeometry(
      page,
      "dialog.confirm-dialog button:visible",
    );
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toBeHidden();
  });
});
