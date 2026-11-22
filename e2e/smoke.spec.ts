import {
  assertTouchTargetGeometry,
  assertZeroAxeViolations,
  assertZeroViewportOverflow,
  expect,
  isAllowedRequestUrl,
  test,
} from "./fixtures";

const TABS = [
  { id: "budget", label: "Budget" },
  { id: "insights", label: "Insights" },
  { id: "settings", label: "Settings" },
] as const;

test.describe("Phase 4A walking-skeleton smoke, zero-egress, WCAG 2.2 AA & 3-viewport geometry", () => {
  test("boots under strict CSP/Trusted Types with zero external egress and zero console/page errors", async ({
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

    const cspContent = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(cspContent).not.toBeNull();
    expect(cspContent).toContain("connect-src 'none'");
    expect(cspContent).toContain("form-action 'none'");
    expect(cspContent).toContain("require-trusted-types-for 'script'");
    expect(cspContent).toContain("trusted-types sw-register");
    expect(cspContent).not.toContain("frame-ancestors");

    const referrerContent = await page
      .locator('meta[name="referrer"]')
      .getAttribute("content");
    expect(referrerContent).toBe("no-referrer");

    const tablist = page.getByRole("tablist");
    await expect(tablist).toBeVisible();

    const budgetTab = page.getByRole("tab", { name: "Budget" });
    await expect(budgetTab).toHaveAttribute("aria-selected", "true");
    await expect(budgetTab).toHaveAttribute("tabindex", "0");
    await expect(page.locator("#panel-budget")).toBeVisible();
    await expect(page.locator("#panel-insights")).toBeHidden();
    await expect(page.locator("#panel-settings")).toBeHidden();
  });

  test("passes WCAG 2.2 AA axe scan, zero-overflow geometry, and >= 44x44 touch targets on every tab", async ({
    page,
  }) => {
    await page.goto("./");

    for (const tab of TABS) {
      const tabButton = page.getByRole("tab", { name: tab.label });
      await tabButton.click();

      await expect(tabButton).toHaveAttribute("aria-selected", "true");
      await expect(tabButton).toHaveAttribute("tabindex", "0");
      await expect(tabButton).toBeFocused();

      for (const other of TABS) {
        const panel = page.locator(`#panel-${other.id}`);
        if (other.id === tab.id) {
          await expect(panel).toBeVisible();
        } else {
          await expect(panel).toBeHidden();
        }
      }

      await assertZeroAxeViolations(page, `tab:${tab.id}`);
      await assertZeroViewportOverflow(page, `tab:${tab.id}`);
      await assertTouchTargetGeometry(page, "button:visible");
    }

    // Verify roving tabindex keyboard navigation wraps cleanly across tabs.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Budget" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("passes WCAG 2.2 AA axe scan, zero-overflow geometry, and >= 44x44 touch targets on open <dialog>", async ({
    page,
  }) => {
    await page.goto("./");

    const settingsTab = page.getByRole("tab", { name: "Settings" });
    await settingsTab.click();
    await expect(settingsTab).toBeFocused();

    const dialog = page.locator("dialog.confirm-dialog");
    await expect(dialog).toBeHidden();

    await dialog.evaluate((node: HTMLDialogElement) => {
      node.showModal();
    });
    await expect(dialog).toBeVisible();

    await assertZeroAxeViolations(page, "open <dialog>");
    await assertZeroViewportOverflow(page, "open <dialog>");
    await assertTouchTargetGeometry(
      page,
      "dialog.confirm-dialog button:visible",
    );

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(settingsTab).toBeFocused();
  });
});
