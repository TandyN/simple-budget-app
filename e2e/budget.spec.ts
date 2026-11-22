import {
  assertTouchTargetGeometry,
  assertZeroAxeViolations,
  assertZeroViewportOverflow,
  expect,
  isAllowedRequestUrl,
  test,
} from "./fixtures";

/**
 * Deterministic mid-month UTC instant used so monthly recurring rules with
 * `dayOfMonth: 1` (due at `YYYY-MM-01T12:00:00.000Z`) are always past due
 * regardless of the real calendar date/hour when tests execute.
 */
const FIXED_TEST_TIME = new Date("2026-07-15T14:00:00.000Z");

const IMG_XSS_PAYLOAD = "<img src=x onerror=window.__xss=1>";
const SCRIPT_XSS_PAYLOAD = "<script>window.__xss=1</script>";

test.describe("Phase 4B Budget tab vertical slice, DOM XSS, WCAG 2.2 AA & 3-viewport gates", () => {
  test("cold start renders $0.00 Available Funds (aria-live=polite), empty feed, zero external egress, and zero console/page errors", async ({
    context,
    page,
    baseURL,
  }) => {
    const previewOrigin = new URL(
      baseURL ?? "http://127.0.0.1:4173/simple-budget-app/",
    ).origin;
    const observedRequests: string[] = [];
    context.on("request", (req) => {
      observedRequests.push(req.url());
    });

    await page.goto("./");

    expect(observedRequests.length).toBeGreaterThan(0);
    for (const url of observedRequests) {
      expect(isAllowedRequestUrl(url, previewOrigin)).toBe(true);
    }

    const fundsEl = page.locator("#budget-available-funds");
    await expect(fundsEl).toBeVisible();
    await expect(fundsEl).toHaveText("$0.00");
    await expect(fundsEl).toHaveAttribute("aria-live", "polite");
    await expect(fundsEl).toHaveAttribute("aria-atomic", "true");

    await expect(page.locator(".budget-feed-empty")).toBeVisible();
    await expect(page.locator(".budget-feed-list")).toBeHidden();

    const recurringDetails = page.locator("details.budget-recurring-details");
    await expect(recurringDetails).toBeVisible();
    await expect(recurringDetails).not.toHaveAttribute("open", "");
    await expect(page.locator(".budget-recurring-count")).toHaveText("0");
  });

  test("supports recurring rule CRUD, auto-post on due day, reload persistence & idempotency, pause/resume, edit, and delete preserving history", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const fundsEl = page.locator("#budget-available-funds");
    await expect(fundsEl).toHaveText("$0.00");

    // Expand Recurring Rules panel and add an active monthly income rule.
    await page.locator("summary.budget-recurring-summary").click();
    await expect(
      page.locator("details.budget-recurring-details"),
    ).toHaveAttribute("open", "");

    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("2000.00");
    await page.locator("#recurring-add-name").fill("Monthly Salary");
    await page.locator("#recurring-add-day").fill("1");
    await expect(page.locator("#recurring-add-active")).toBeChecked();
    await page.getByRole("button", { name: "Add Rule" }).click();

    // Rule is listed and immediately auto-posts for the due period.
    const ruleItems = page.locator(".budget-recurring-item");
    await expect(ruleItems).toHaveCount(1);
    await expect(ruleItems.first()).toContainText("Monthly Salary");
    await expect(ruleItems.first()).toContainText("$2,000.00");
    await expect(ruleItems.first()).toContainText("Active");
    await expect(ruleItems.first()).toContainText("Monthly · Day 1");
    await expect(page.locator(".budget-recurring-count")).toHaveText("1");

    const feedItems = page.locator(".budget-feed-item");
    await expect(feedItems).toHaveCount(1);
    await expect(feedItems.first()).toContainText("Income");
    await expect(feedItems.first()).toContainText("Recurring");
    await expect(feedItems.first()).toContainText("$2,000.00");
    await expect(fundsEl).toHaveText("$2,000.00");

    // Reload and verify persistence + idempotency (no duplicate auto-post).
    await page.reload();
    await expect(fundsEl).toHaveText("$2,000.00");
    await expect(feedItems).toHaveCount(1);

    await page.locator("summary.budget-recurring-summary").click();
    await expect(ruleItems).toHaveCount(1);
    await expect(ruleItems.first()).toContainText("Monthly Salary");
    await expect(page.locator(".budget-recurring-count")).toHaveText("1");

    // Edit the rule via native <dialog>; prior posted activity stays $2,000.00.
    await ruleItems.first().getByRole("button", { name: /Edit/ }).click();
    const editRuleDialog = page.locator("dialog.budget-rule-edit-dialog");
    await expect(editRuleDialog).toBeVisible();

    await page.locator("#recurring-edit-name").fill("Updated Salary");
    await page.locator("#recurring-edit-amount").fill("2150.00");
    await editRuleDialog.getByRole("button", { name: "Save Rule" }).click();
    await expect(editRuleDialog).toBeHidden();

    await expect(ruleItems.first()).toContainText("Updated Salary");
    await expect(ruleItems.first()).toContainText("$2,150.00");
    await expect(fundsEl).toHaveText("$2,000.00");
    await expect(feedItems).toHaveCount(1);

    // Pause and Resume the rule without duplicating posted activity.
    await ruleItems.first().getByRole("button", { name: /Pause/ }).click();
    await expect(ruleItems.first()).toContainText("Paused");

    await ruleItems
      .first()
      .getByRole("button", { name: /Resume/ })
      .click();
    await expect(ruleItems.first()).toContainText("Active");
    await expect(fundsEl).toHaveText("$2,000.00");
    await expect(feedItems).toHaveCount(1);

    // Delete the rule via native <dialog>: Cancel preserves, Confirm deletes
    // while preserving the previously auto-posted activity.
    const confirmDialog = page.locator("dialog.confirm-dialog");
    await ruleItems
      .first()
      .getByRole("button", { name: /Delete/ })
      .click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(ruleItems).toHaveCount(1);

    await ruleItems
      .first()
      .getByRole("button", { name: /Delete/ })
      .click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden();

    await expect(ruleItems).toHaveCount(0);
    await expect(page.locator(".budget-recurring-empty")).toBeVisible();
    await expect(page.locator(".budget-recurring-count")).toHaveText("0");
    await expect(feedItems).toHaveCount(1);
    await expect(fundsEl).toHaveText("$2,000.00");
  });

  test("calculates exact integer-cent Available Funds across recurring + manual deposit, income, and expense and persists across reload", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const fundsEl = page.locator("#budget-available-funds");
    await expect(fundsEl).toHaveText("$0.00");

    // Seed $2,000.00 recurring income so total reaches $2,305.00 after manual entries.
    await page.locator("summary.budget-recurring-summary").click();
    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("2000.00");
    await page.locator("#recurring-add-name").fill("Base Salary");
    await page.locator("#recurring-add-day").fill("1");
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(fundsEl).toHaveText("$2,000.00");

    // Collapse Recurring Rules to use Quick Add cleanly.
    await page.locator("summary.budget-recurring-summary").click();

    // Manual deposit: +$250.50 -> $2,250.50
    await page.locator("#quick-add-type").selectOption("deposit");
    await page.locator("#quick-add-amount").fill("250.50");
    await page.locator("#quick-add-memo").fill("Initial deposit");
    await page.locator("#quick-add-tags").fill("savings, reserve");
    await page.getByRole("button", { name: "Add Activity" }).click();
    await expect(fundsEl).toHaveText("$2,250.50");

    // Manual income: +$100.25 -> $2,350.75
    await page.locator("#quick-add-type").selectOption("income");
    await page.locator("#quick-add-amount").fill("100.25");
    await page.locator("#quick-add-memo").fill("Freelance bonus");
    await page.locator("#quick-add-tags").fill("side-gig");
    await page.getByRole("button", { name: "Add Activity" }).click();
    await expect(fundsEl).toHaveText("$2,350.75");

    // Manual expense: -$45.75 -> $2,305.00
    await page.locator("#quick-add-type").selectOption("expense");
    await page.locator("#quick-add-amount").fill("45.75");
    await page.locator("#quick-add-memo").fill("Weekly groceries");
    await page.locator("#quick-add-tags").fill("groceries, essentials");
    await page.getByRole("button", { name: "Add Activity" }).click();
    await expect(fundsEl).toHaveText("$2,305.00");

    const feedItems = page.locator(".budget-feed-item");
    await expect(feedItems).toHaveCount(4);
    await expect(page.locator(".budget-feed-list")).toContainText(
      "Initial deposit",
    );
    await expect(page.locator(".budget-feed-list")).toContainText(
      "Freelance bonus",
    );
    await expect(page.locator(".budget-feed-list")).toContainText(
      "Weekly groceries",
    );
    await expect(page.locator(".budget-tag-chip")).toContainText([
      "groceries",
      "essentials",
    ]);

    // Reload and verify IndexedDB persistence.
    await page.reload();
    await expect(fundsEl).toHaveText("$2,305.00");
    await expect(feedItems).toHaveCount(4);
    await expect(page.locator(".budget-feed-list")).toContainText(
      "Weekly groceries",
    );
  });

  test("edits, backdates, tags, and deletes activities via native <dialog> without reposting deleted recurring activities", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    const fundsEl = page.locator("#budget-available-funds");
    await expect(fundsEl).toHaveText("$0.00");

    // Create an active recurring income rule ($1,500.00) that auto-posts.
    await page.locator("summary.budget-recurring-summary").click();
    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("1500.00");
    await page.locator("#recurring-add-name").fill("Paycheck");
    await page.locator("#recurring-add-day").fill("1");
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(fundsEl).toHaveText("$1,500.00");
    await page.locator("summary.budget-recurring-summary").click();

    // Add a manual expense ($50.00) -> $1,450.00.
    await page.locator("#quick-add-type").selectOption("expense");
    await page.locator("#quick-add-amount").fill("50.00");
    await page.locator("#quick-add-memo").fill("Coffee beans");
    await page.locator("#quick-add-tags").fill("coffee");
    await page.getByRole("button", { name: "Add Activity" }).click();
    await expect(fundsEl).toHaveText("$1,450.00");

    const feedItems = page.locator(".budget-feed-item");
    await expect(feedItems).toHaveCount(2);

    // Open Edit <dialog> on the manual activity, change type/amount/date/memo/tags.
    const manualItem = feedItems.filter({ hasText: "Coffee beans" });
    await manualItem.getByRole("button", { name: /Edit/ }).click();

    const editDialog = page.locator("dialog.budget-edit-dialog");
    await expect(editDialog).toBeVisible();

    await page.locator("#edit-activity-type").selectOption("deposit");
    await page.locator("#edit-activity-amount").fill("75.25");
    await page.locator("#edit-activity-datetime").fill("2025-06-15T09:30");
    await page.locator("#edit-activity-memo").fill("Refunded coffee");
    await page.locator("#edit-activity-tags").fill("refund, kitchen");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(editDialog).toBeHidden();

    // Available Funds = $1,500.00 + $75.25 = $1,575.25.
    await expect(fundsEl).toHaveText("$1,575.25");
    const updatedItem = feedItems.filter({ hasText: "Refunded coffee" });
    await expect(updatedItem).toHaveCount(1);
    await expect(updatedItem).toContainText("Deposit");
    await expect(updatedItem).toContainText("$75.25");
    await expect(updatedItem.locator(".budget-tag-chip")).toHaveText([
      "refund",
      "kitchen",
    ]);
    const expectedBackdatedIso = await page.evaluate(() =>
      new Date("2025-06-15T09:30").toISOString(),
    );
    const backdatedIso = await updatedItem
      .locator("time.budget-feed-time")
      .getAttribute("datetime");
    expect(backdatedIso).toBe(expectedBackdatedIso);

    // Delete confirmation <dialog>: Cancel preserves, Confirm removes.
    const confirmDialog = page.locator("dialog.confirm-dialog");
    await updatedItem.getByRole("button", { name: /Delete/ }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(feedItems).toHaveCount(2);
    await expect(fundsEl).toHaveText("$1,575.25");

    await updatedItem.getByRole("button", { name: /Delete/ }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(feedItems).toHaveCount(1);
    await expect(fundsEl).toHaveText("$1,500.00");

    // Delete the auto-posted recurring activity, then reload and verify it is
    // NOT re-posted (rule.lastPostPeriod remains advanced).
    const recurringItem = feedItems.filter({ hasText: "Recurring" });
    await recurringItem.getByRole("button", { name: /Delete/ }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden();

    await expect(feedItems).toHaveCount(0);
    await expect(page.locator(".budget-feed-empty")).toBeVisible();
    await expect(fundsEl).toHaveText("$0.00");

    await page.reload();
    await expect(fundsEl).toHaveText("$0.00");
    await expect(feedItems).toHaveCount(0);
    await expect(page.locator(".budget-feed-empty")).toBeVisible();
  });

  test("renders DOM XSS payloads in recurring rule name, activity memo, and tags as inert text with zero execution", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    await expect(page.locator("#budget-available-funds")).toHaveText("$0.00");

    // Submit IMG XSS payload in a recurring rule name.
    await page.locator("summary.budget-recurring-summary").click();
    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("100.00");
    await page.locator("#recurring-add-name").fill(IMG_XSS_PAYLOAD);
    await page.locator("#recurring-add-day").fill("1");
    await page.getByRole("button", { name: "Add Rule" }).click();

    await expect(page.locator(".budget-recurring-name")).toHaveText(
      IMG_XSS_PAYLOAD,
    );

    // Submit SCRIPT XSS payload in memo and both payloads in tags.
    await page.locator("#quick-add-type").selectOption("expense");
    await page.locator("#quick-add-amount").fill("25.00");
    await page.locator("#quick-add-memo").fill(SCRIPT_XSS_PAYLOAD);
    await page
      .locator("#quick-add-tags")
      .fill(`${IMG_XSS_PAYLOAD}, ${SCRIPT_XSS_PAYLOAD}`);
    await page.getByRole("button", { name: "Add Activity" }).click();

    const assertInertXssState = async (): Promise<void> => {
      const xssMarker = await page.evaluate(
        () => (window as unknown as { __xss?: unknown }).__xss,
      );
      expect(xssMarker).toBeUndefined();

      await expect(page.locator("#panel-budget img")).toHaveCount(0);
      await expect(page.locator("#panel-budget script")).toHaveCount(0);

      await expect(page.locator(".budget-recurring-name")).toHaveText(
        IMG_XSS_PAYLOAD,
      );
      await expect(page.locator(".budget-feed-memo")).toHaveText([
        SCRIPT_XSS_PAYLOAD,
        `Auto-posted: ${IMG_XSS_PAYLOAD}`,
      ]);
      await expect(page.locator(".budget-tag-chip")).toHaveText([
        IMG_XSS_PAYLOAD,
        SCRIPT_XSS_PAYLOAD,
      ]);
    };

    await assertInertXssState();

    // Reload from IndexedDB and verify payloads remain strictly inert.
    await page.reload();
    await page.locator("summary.budget-recurring-summary").click();
    await assertInertXssState();
  });

  test("passes WCAG 2.2 AA axe scan, zero-overflow geometry, and >= 44x44 touch targets across populated Budget views and open dialogs", async ({
    page,
  }) => {
    await page.clock.setSystemTime(FIXED_TEST_TIME);
    await page.goto("./");

    await expect(page.locator("#budget-available-funds")).toHaveText("$0.00");

    // Populate with a recurring income rule and a manual expense.
    await page.locator("summary.budget-recurring-summary").click();
    await page.locator("#recurring-add-type").selectOption("income");
    await page.locator("#recurring-add-amount").fill("1200.00");
    await page.locator("#recurring-add-name").fill("Monthly Stipend");
    await page.locator("#recurring-add-day").fill("1");
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.locator("#budget-available-funds")).toHaveText(
      "$1,200.00",
    );

    await page.locator("#quick-add-type").selectOption("expense");
    await page.locator("#quick-add-amount").fill("42.50");
    await page.locator("#quick-add-memo").fill("Neighborhood market");
    await page.locator("#quick-add-tags").fill("food, essentials");
    await page.getByRole("button", { name: "Add Activity" }).click();
    await expect(page.locator("#budget-available-funds")).toHaveText(
      "$1,157.50",
    );

    // 1. Populated Budget tab (Recurring Rules collapsed).
    await page.locator("summary.budget-recurring-summary").click();
    await expect(
      page.locator("details.budget-recurring-details"),
    ).not.toHaveAttribute("open", "");
    await assertZeroAxeViolations(page, "populated Budget tab");
    await assertZeroViewportOverflow(page, "populated Budget tab");
    await assertTouchTargetGeometry(page, "button:visible");
    await assertTouchTargetGeometry(page, "summary.budget-recurring-summary");

    // 2. Populated Budget tab with Recurring Rules expanded.
    await page.locator("summary.budget-recurring-summary").click();
    await expect(
      page.locator("details.budget-recurring-details"),
    ).toHaveAttribute("open", "");
    await assertZeroAxeViolations(
      page,
      "Budget tab with Recurring Rules expanded",
    );
    await assertZeroViewportOverflow(
      page,
      "Budget tab with Recurring Rules expanded",
    );
    await assertTouchTargetGeometry(page, "button:visible");

    // 3. Open Edit Activity <dialog>.
    const manualItem = page
      .locator(".budget-feed-item")
      .filter({ hasText: "Neighborhood market" });
    await manualItem.getByRole("button", { name: /Edit/ }).click();
    const editActivityDialog = page.locator("dialog.budget-edit-dialog");
    await expect(editActivityDialog).toBeVisible();
    await assertZeroAxeViolations(page, "Edit Activity <dialog>");
    await assertZeroViewportOverflow(page, "Edit Activity <dialog>");
    await assertTouchTargetGeometry(
      page,
      "dialog.budget-edit-dialog button:visible",
    );
    await editActivityDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editActivityDialog).toBeHidden();

    // 4. Open Edit Recurring Rule <dialog>.
    await page
      .locator(".budget-recurring-item")
      .first()
      .getByRole("button", { name: /Edit/ })
      .click();
    const editRuleDialog = page.locator("dialog.budget-rule-edit-dialog");
    await expect(editRuleDialog).toBeVisible();
    await assertZeroAxeViolations(page, "Edit Recurring Rule <dialog>");
    await assertZeroViewportOverflow(page, "Edit Recurring Rule <dialog>");
    await assertTouchTargetGeometry(
      page,
      "dialog.budget-rule-edit-dialog button:visible",
    );
    await editRuleDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editRuleDialog).toBeHidden();

    // 5. Open Delete confirmation <dialog>.
    await manualItem.getByRole("button", { name: /Delete/ }).click();
    const confirmDialog = page.locator("dialog.confirm-dialog");
    await expect(confirmDialog).toBeVisible();
    await assertZeroAxeViolations(page, "Delete confirmation <dialog>");
    await assertZeroViewportOverflow(page, "Delete confirmation <dialog>");
    await assertTouchTargetGeometry(
      page,
      "dialog.confirm-dialog button:visible",
    );
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toBeHidden();
  });
});
