import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * Mandatory WCAG 2.2 Level A & AA axe-core rule tags enforced across every tab
 * and open `<dialog>` modal (`project-plan/testing.md`).
 */
export const WCAG_22_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21aa",
  "wcag22aa",
] as const;

/**
 * WCAG 2.2 AA minimum interactive touch-target dimension in CSS pixels
 * (`project-plan/frontend.md → Contrast & touch targets`).
 */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * Folded ↔ unfolded split-pane media-query breakpoint in CSS pixels
 * (`src/styles/frame.css`).
 */
export const UNFOLDED_MIN_WIDTH_PX = 700;

/**
 * Checks whether a request URL is permitted under the zero-external-egress E2E
 * gate (`project-plan/testing.md → Zero network egress E2E assertion`).
 *
 * Only requests targeting the local preview server origin or local non-network
 * `data:` / `blob:` schemes are allowed.
 */
export function isAllowedRequestUrl(
  rawUrl: string,
  previewOrigin: string,
): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return (
    url.protocol === "data:" ||
    url.protocol === "blob:" ||
    url.origin === previewOrigin
  );
}

interface GateFixtures {
  /**
   * Automatic per-test security and console cleanliness fixture:
   * 1. Attaches `context.on("request")` before any navigation to enforce zero
   *    external network egress.
   * 2. Attaches `pageerror` and `console` (`error` / `warning`) listeners to
   *    every page in the browser context and asserts zero issues at teardown.
   */
  readonly zeroEgressAndConsoleGate: undefined;
}

export const test = base.extend<GateFixtures>({
  zeroEgressAndConsoleGate: [
    async ({ context, page, baseURL }, use) => {
      const previewOrigin = new URL(
        baseURL ?? "http://127.0.0.1:4173/simple-budget-app/",
      ).origin;

      const disallowedRequests: string[] = [];
      const pageErrors: string[] = [];
      const consoleIssues: string[] = [];

      context.on("request", (req) => {
        const requestUrl = req.url();
        const allowed = isAllowedRequestUrl(requestUrl, previewOrigin);
        if (!allowed) {
          disallowedRequests.push(requestUrl);
        }
        expect(
          allowed,
          `Unexpected external network request: ${requestUrl}`,
        ).toBe(true);
      });

      const attachPageListeners = (targetPage: Page): void => {
        targetPage.on("pageerror", (err) => {
          pageErrors.push(`[pageerror] ${err.message}`);
        });
        targetPage.on("console", (msg) => {
          const type = msg.type();
          if (type === "error" || type === "warning") {
            consoleIssues.push(`[console.${type}] ${msg.text()}`);
          }
        });
      };

      attachPageListeners(page);
      context.on("page", attachPageListeners);

      await use(undefined);

      expect(
        disallowedRequests,
        "Expected zero external network requests across the test lifecycle",
      ).toEqual([]);
      expect(
        pageErrors,
        "Expected zero uncaught pageerror events across the test lifecycle",
      ).toEqual([]);
      expect(
        consoleIssues,
        "Expected zero console.error and console.warning messages across the test lifecycle",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Runs an `@axe-core/playwright` (`AxeBuilder`) scan with the mandatory WCAG
 * 2.2 Level A & AA tags and asserts zero accessibility violations.
 */
export async function assertZeroAxeViolations(
  page: Page,
  contextLabel?: string,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_22_AA_TAGS])
    .analyze();
  const suffix = contextLabel !== undefined ? ` (${contextLabel})` : "";
  expect(
    results.violations,
    `Expected zero WCAG 2.2 AA axe violations${suffix}`,
  ).toEqual([]);
}

/**
 * Asserts zero page-level vertical or horizontal overflow
 * (`scrollHeight <= window.innerHeight` and `scrollWidth <= window.innerWidth`)
 * and verifies the iPhone-Duo folded (`column`) vs. unfolded (`row`) layout
 * invariant for the active viewport width.
 */
export async function assertZeroViewportOverflow(
  page: Page,
  contextLabel?: string,
): Promise<void> {
  const suffix = contextLabel !== undefined ? ` (${contextLabel})` : "";
  const metrics = await page.evaluate(() => {
    const docEl = document.documentElement;
    const app = document.getElementById("app");
    const tablist = document.querySelector('nav[role="tablist"]');
    return {
      scrollHeight: docEl.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: docEl.scrollWidth,
      innerWidth: window.innerWidth,
      appFlexDirection: app !== null ? getComputedStyle(app).flexDirection : "",
      tablistWidth:
        tablist !== null ? tablist.getBoundingClientRect().width : 0,
    };
  });

  expect(
    metrics.scrollHeight,
    `Expected scrollHeight (${String(metrics.scrollHeight)}) <= innerHeight (${String(metrics.innerHeight)})${suffix}`,
  ).toBeLessThanOrEqual(metrics.innerHeight);

  expect(
    metrics.scrollWidth,
    `Expected scrollWidth (${String(metrics.scrollWidth)}) <= innerWidth (${String(metrics.innerWidth)})${suffix}`,
  ).toBeLessThanOrEqual(metrics.innerWidth);

  if (metrics.innerWidth >= UNFOLDED_MIN_WIDTH_PX) {
    expect(
      metrics.appFlexDirection,
      `Expected unfolded split-pane row layout at width ${String(metrics.innerWidth)}${suffix}`,
    ).toBe("row");
    expect(
      metrics.tablistWidth,
      `Expected 200px tablist rail in unfolded split-pane layout${suffix}`,
    ).toBe(200);
  } else {
    expect(
      metrics.appFlexDirection,
      `Expected folded single-panel column layout at width ${String(metrics.innerWidth)}${suffix}`,
    ).toBe("column");
  }
}

/**
 * Asserts that every visible interactive element matching `selector` satisfies
 * the `>= 44×44 CSS px` touch-target floor (`project-plan/frontend.md`).
 */
export async function assertTouchTargetGeometry(
  page: Page,
  selector = "button:visible",
): Promise<void> {
  const controls = await page.locator(selector).all();
  expect(
    controls.length,
    `Expected at least one visible control matching "${selector}"`,
  ).toBeGreaterThan(0);

  for (const control of controls) {
    const label = ((await control.textContent()) ?? "").trim() || selector;
    const box = await control.boundingBox();
    expect(
      box,
      `Expected bounding box for interactive control "${label}"`,
    ).not.toBeNull();
    if (box !== null) {
      expect(
        box.width,
        `Expected touch target width >= ${String(MIN_TOUCH_TARGET_PX)}px for "${label}" (got ${String(box.width)}px)`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      expect(
        box.height,
        `Expected touch target height >= ${String(MIN_TOUCH_TARGET_PX)}px for "${label}" (got ${String(box.height)}px)`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    }
  }
}
