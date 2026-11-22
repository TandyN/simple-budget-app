import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
  assertTouchTargetGeometry,
  assertZeroAxeViolations,
  assertZeroViewportOverflow,
  expect,
  isAllowedRequestUrl,
  test,
} from "./fixtures";

interface ManifestIcon {
  readonly src: string;
  readonly sizes?: string;
  readonly type?: string;
  readonly purpose?: string;
}

interface WebAppManifest {
  readonly name?: string;
  readonly short_name?: string;
  readonly start_url?: string;
  readonly scope?: string;
  readonly display?: string;
  readonly icons?: readonly ManifestIcon[];
}

const PROD_BASE_PATH = "/simple-budget-app/";
const PR_PREVIEW_BASE_PATH = "/simple-budget-app/pr-999/";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/**
 * Waits until `navigator.serviceWorker.ready` resolves and the page is
 * actively controlled by its Service Worker (`clients.claim()`).
 */
async function waitForControllingServiceWorker(page: Page): Promise<{
  scope: string;
  updateViaCache: string;
}> {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller === null) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        );
      });
    }
    return {
      scope: reg.scope,
      updateViaCache: reg.updateViaCache,
    };
  });
}

/**
 * Starts a minimal local `127.0.0.1` static HTTP server for a built bundle
 * directory mounted at `basePath` (torn down cleanly via `closeServer`).
 * Optional `getSwOverride` lets tests swap `sw.js` bytes mid-session so real
 * `registration.update()` fetches a byte-different worker over HTTP.
 */
function startStaticPreviewServer(
  outDir: string,
  basePath: string,
  options?: {
    readonly getSwOverride?: () => string | null;
  },
): Promise<{ server: Server; origin: string }> {
  const resolvedOutDir = path.resolve(outDir);
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqPath = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (!reqPath.startsWith(basePath)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      const relRaw = reqPath.slice(basePath.length);
      if (relRaw === "sw.js" && options?.getSwOverride !== undefined) {
        const override = options.getSwOverride();
        if (override !== null) {
          res.writeHead(200, {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(override);
          return;
        }
      }

      const relPath =
        relRaw === "" || relRaw.endsWith("/") ? `${relRaw}index.html` : relRaw;
      const fullPath = path.resolve(resolvedOutDir, relPath);
      if (
        fullPath !== resolvedOutDir &&
        !fullPath.startsWith(`${resolvedOutDir}${path.sep}`)
      ) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });
      res.end(readFileSync(fullPath));
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      if (address === null) {
        reject(new Error("Failed to bind local static preview server"));
        return;
      }
      resolve({
        server,
        origin: `http://127.0.0.1:${String(address.port)}`,
      });
    });
  });
}

async function closeServer(server: Server | null): Promise<void> {
  if (server === null) {
    return;
  }
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

test.describe("Phase 4D Offline PWA — Manifest, Icons & Native Shell Guard (Chromium + WebKit)", () => {
  test("serves valid Web App Manifest and self-hosted icons with HTTP 200 and zero external egress", async ({
    page,
    baseURL,
  }) => {
    const previewOrigin = new URL(
      baseURL ?? "http://127.0.0.1:4173/simple-budget-app/",
    ).origin;

    await page.goto("./");
    await expect(page.locator("#budget-available-funds")).toBeVisible();

    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestHref).not.toBeNull();

    const manifestUrl = new URL(manifestHref ?? "", page.url()).href;
    expect(isAllowedRequestUrl(manifestUrl, previewOrigin)).toBe(true);
    expect(manifestUrl.endsWith("/manifest.webmanifest")).toBe(true);

    const manifestResponse = await page.request.get(manifestUrl);
    expect(manifestResponse.status()).toBe(200);

    const manifest = (await manifestResponse.json()) as WebAppManifest;
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);

    for (const icon of manifest.icons ?? []) {
      expect(icon.src.startsWith("/")).toBe(false);
      expect(icon.src.startsWith("http://")).toBe(false);
      expect(icon.src.startsWith("https://")).toBe(false);

      const iconUrl = new URL(icon.src, manifestUrl).href;
      expect(isAllowedRequestUrl(iconUrl, previewOrigin)).toBe(true);

      const iconResponse = await page.request.get(iconUrl);
      expect(
        iconResponse.status(),
        `Expected HTTP 200 for manifest icon ${icon.src}`,
      ).toBe(200);
      expect((await iconResponse.body()).byteLength).toBeGreaterThan(0);
    }

    await assertZeroAxeViolations(page, "manifest-and-icons");
    await assertZeroViewportOverflow(page, "manifest-and-icons");
    await assertTouchTargetGeometry(page, "button:visible");
  });

  test("skips Service Worker registration when running inside a Capacitor native shell", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { Capacitor?: unknown }).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BackupService: {
            saveBackup: async () => {},
            shareBackup: async () => {},
          },
        },
      };
    });

    await page.goto("./");
    await expect(page.locator("#budget-available-funds")).toBeVisible();

    const registrationCount = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) {
        return 0;
      }
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    expect(registrationCount).toBe(0);
  });
});

test.describe("Phase 4D Offline PWA — Service Worker, Offline Reload, pr-* Bypass & Update Lifecycle (Chromium)", () => {
  test("registers SW with updateViaCache: none, caches app shell, and reloads cleanly offline with IndexedDB data intact", async ({
    context,
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Service Worker offline reload E2E runs on Chromium",
    );

    await page.goto("./");
    await expect(page.locator("#budget-available-funds")).toHaveText("$0.00");

    const swInfo = await waitForControllingServiceWorker(page);
    expect(swInfo.scope.endsWith(PROD_BASE_PATH)).toBe(true);
    expect(swInfo.updateViaCache).toBe("none");

    const cacheKeys = await page.evaluate(async () => caches.keys());
    expect(
      cacheKeys.some((key) => /^sbapp-[0-9a-f]{12}$/.test(key)),
      `Expected active production cache matching sbapp-<hash>, got: ${cacheKeys.join(", ")}`,
    ).toBe(true);

    // Seed a manual transaction while online (persisted in IndexedDB).
    await page.locator("#quick-add-type").selectOption("deposit");
    await page.locator("#quick-add-amount").fill("125.50");
    await page.locator("#quick-add-memo").fill("Offline resilience seed");
    await page.locator("#quick-add-tags").fill("offline-check");
    await page.getByRole("button", { name: "Add Activity" }).click();

    await expect(page.locator("#budget-available-funds")).toHaveText("$125.50");
    await expect(page.locator(".budget-feed-list")).toContainText(
      "Offline resilience seed",
    );

    // Toggle offline, reload from the SW precache, and verify IndexedDB + gates.
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator("#budget-available-funds")).toHaveText(
        "$125.50",
      );
      await expect(page.locator(".budget-feed-list")).toContainText(
        "Offline resilience seed",
      );

      await assertZeroAxeViolations(page, "offline-reload");
      await assertZeroViewportOverflow(page, "offline-reload");
      await assertTouchTargetGeometry(page, "button:visible");
    } finally {
      await context.setOffline(false);
    }
  });

  test("bypasses /simple-budget-app/pr-* sub-paths in the production Service Worker", async ({
    context,
    page,
    browserName,
    baseURL,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Service Worker pr-* sub-path bypass E2E runs on Chromium",
    );

    const previewOrigin = new URL(
      baseURL ?? "http://127.0.0.1:4173/simple-budget-app/",
    ).origin;

    await page.goto("./");
    await expect(page.locator("#budget-available-funds")).toBeVisible();
    await waitForControllingServiceWorker(page);

    // Online: intercept the PR preview sub-path at the network layer and prove
    // the production SW bypasses it instead of returning cached production HTML.
    let sentinelHits = 0;
    await context.route("**/simple-budget-app/pr-999/", async (route) => {
      sentinelHits += 1;
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: '<!doctype html><html lang="en"><head><title>PR-999 Sentinel</title></head><body><h1>PR-999 Preview Sentinel</h1></body></html>',
      });
    });

    await page.goto(`${previewOrigin}${PR_PREVIEW_BASE_PATH}`);
    await expect(
      page.getByRole("heading", { name: "PR-999 Preview Sentinel" }),
    ).toBeVisible();
    expect(sentinelHits).toBe(1);
    await expect(page.locator("#budget-available-funds")).toHaveCount(0);

    // Offline: removing the network route and navigating while offline MUST fail
    // with a network error rather than falling back to cached production index.html.
    await context.unroute("**/simple-budget-app/pr-999/");
    await context.setOffline(true);
    try {
      let offlineNavFailed = false;
      try {
        await page.goto(`${previewOrigin}${PR_PREVIEW_BASE_PATH}`);
      } catch {
        offlineNavFailed = true;
      }
      expect(
        offlineNavFailed,
        "Expected offline navigation to /simple-budget-app/pr-999/ to bypass production SW cache fallback",
      ).toBe(true);
    } finally {
      await context.setOffline(false);
    }
  });

  test("shows accessible Update available banner on waiting SW, activates only on Update now, and prunes stale production caches while preserving sbapp-pr-* caches", async ({
    browser,
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Service Worker update banner & cache cleanup E2E runs on Chromium",
    );

    const distDir = path.resolve(process.cwd(), "dist");
    const originalSwSource = readFileSync(path.join(distDir, "sw.js"), "utf8");
    const hashMatch = /const BUILD_HASH = "([0-9a-f]+)";/.exec(
      originalSwSource,
    );
    expect(hashMatch?.[1]).toBeDefined();
    const originalHash = hashMatch?.[1] ?? "";
    const nextHash =
      originalHash === "deadbeef9999" ? "cafebabe8888" : "deadbeef9999";
    const originalCache = `sbapp-${originalHash}`;
    const nextCache = `sbapp-${nextHash}`;

    const updatedSwSource = originalSwSource
      .replace(
        `const BUILD_HASH = "${originalHash}";`,
        `const BUILD_HASH = "${nextHash}";`,
      )
      .replace(
        `const ACTIVE_CACHE = "${originalCache}";`,
        `const ACTIVE_CACHE = "${nextCache}";`,
      );
    expect(updatedSwSource).not.toBe(originalSwSource);

    let swOverride: string | null = null;
    const { server, origin } = await startStaticPreviewServer(
      distDir,
      PROD_BASE_PATH,
      { getSwOverride: () => swOverride },
    );

    const viewport = page.viewportSize() ?? undefined;
    const updateContext = await browser.newContext(
      viewport !== undefined ? { viewport } : {},
    );
    const disallowedRequests: string[] = [];
    const pageErrors: string[] = [];
    const consoleIssues: string[] = [];

    updateContext.on("request", (req) => {
      const url = req.url();
      if (!isAllowedRequestUrl(url, origin)) {
        disallowedRequests.push(url);
      }
    });

    const updatePage = await updateContext.newPage();
    updatePage.on("pageerror", (err) => {
      pageErrors.push(`[pageerror] ${err.message}`);
    });
    updatePage.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        consoleIssues.push(`[console.${type}] ${msg.text()}`);
      }
    });

    try {
      await updatePage.goto(`${origin}${PROD_BASE_PATH}`);
      await expect(updatePage.locator("#budget-available-funds")).toBeVisible();
      await waitForControllingServiceWorker(updatePage);

      // Seed an obsolete production cache and a sibling PR-preview cache.
      await updatePage.evaluate(async () => {
        await caches.open("sbapp-oldstale00");
        await caches.open("sbapp-pr-42-keepme");
      });

      // Serve the byte-different updated sw.js and trigger registration.update().
      swOverride = updatedSwSource;
      await updatePage.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        await reg.update();
      });

      const banner = updatePage.locator(".update-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute("role", "status");
      await expect(banner).toHaveAttribute("aria-live", "polite");

      // Verify the new worker is waiting (did NOT swap silently) and stale cache
      // has NOT been pruned before user acceptance.
      const preAcceptState = await updatePage.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        const keys = await caches.keys();
        return {
          hasWaiting: reg.waiting !== null,
          keys,
        };
      });
      expect(preAcceptState.hasWaiting).toBe(true);
      expect(preAcceptState.keys).toContain(nextCache);
      expect(preAcceptState.keys).toContain("sbapp-oldstale00");
      expect(preAcceptState.keys).toContain("sbapp-pr-42-keepme");

      // Accessibility, viewport overflow, and touch target checks on visible banner.
      await assertZeroAxeViolations(updatePage, "update-available-banner");
      await assertZeroViewportOverflow(updatePage, "update-available-banner");
      await assertTouchTargetGeometry(
        updatePage,
        ".update-banner button:visible",
      );

      const updateButton = banner.getByRole("button", { name: "Update now" });
      const dismissButton = banner.getByRole("button", { name: "Dismiss" });
      await expect(updateButton).toBeVisible();
      await expect(dismissButton).toBeVisible();

      // User accepts the update -> posts { type: "SKIP_WAITING" } -> single reload.
      await Promise.all([
        updatePage.waitForEvent("load"),
        updateButton.click(),
      ]);

      await expect(updatePage.locator("#budget-available-funds")).toBeVisible();
      await waitForControllingServiceWorker(updatePage);
      await expect(banner).toBeHidden();

      // Verify obsolete production caches were pruned while sbapp-pr-42-keepme survived.
      await expect
        .poll(async () => updatePage.evaluate(async () => caches.keys()))
        .toContain(nextCache);
      const postActivateKeys = await updatePage.evaluate(async () =>
        caches.keys(),
      );
      expect(postActivateKeys).toContain(nextCache);
      expect(postActivateKeys).toContain("sbapp-pr-42-keepme");
      expect(postActivateKeys).not.toContain("sbapp-oldstale00");
      expect(postActivateKeys).not.toContain(originalCache);
    } finally {
      await updateContext.close();
      await closeServer(server);
    }

    expect(disallowedRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleIssues).toEqual([]);
  });
});

test.describe("Phase 4D Offline PWA — PR-Preview Build Isolation (OQ-1, Chromium)", () => {
  let prOutDir: string | null = null;
  let prServer: Server | null = null;
  let prOrigin = "";

  test.beforeAll(async ({ browserName }) => {
    if (browserName !== "chromium") {
      return;
    }
    prOutDir = mkdtempSync(path.join(os.tmpdir(), "sbapp-pr999-"));
    execFileSync("pnpm", ["exec", "vite", "build", "--outDir", prOutDir], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VITE_BASE_PATH: PR_PREVIEW_BASE_PATH,
      },
      stdio: "pipe",
    });
    const started = await startStaticPreviewServer(
      prOutDir,
      PR_PREVIEW_BASE_PATH,
    );
    prServer = started.server;
    prOrigin = started.origin;
  });

  test.afterAll(async () => {
    await closeServer(prServer);
    prServer = null;
    if (prOutDir !== null) {
      rmSync(prOutDir, { recursive: true, force: true });
      prOutDir = null;
    }
  });

  test("isolates IndexedDB database name (simple-budget-app-pr-999) and SW cache prefix (sbapp-pr-999-) with zero egress", async ({
    browser,
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "PR-preview build IndexedDB & CacheStorage isolation E2E runs on Chromium",
    );

    const viewport = page.viewportSize() ?? undefined;
    const prContext = await browser.newContext(
      viewport !== undefined ? { viewport } : {},
    );
    const disallowedRequests: string[] = [];
    const pageErrors: string[] = [];
    const consoleIssues: string[] = [];

    prContext.on("request", (req) => {
      const url = req.url();
      if (!isAllowedRequestUrl(url, prOrigin)) {
        disallowedRequests.push(url);
      }
    });

    const prPage = await prContext.newPage();
    prPage.on("pageerror", (err) => {
      pageErrors.push(`[pageerror] ${err.message}`);
    });
    prPage.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        consoleIssues.push(`[console.${type}] ${msg.text()}`);
      }
    });

    try {
      await prPage.goto(`${prOrigin}${PR_PREVIEW_BASE_PATH}`);
      await expect(prPage.locator("#budget-available-funds")).toHaveText(
        "$0.00",
      );

      const swInfo = await waitForControllingServiceWorker(prPage);
      expect(swInfo.scope.endsWith(PR_PREVIEW_BASE_PATH)).toBe(true);
      expect(swInfo.updateViaCache).toBe("none");

      const dbNames = await prPage.evaluate(async () => {
        const dbs = await indexedDB.databases();
        return dbs
          .map((db) => db.name)
          .filter((name): name is string => typeof name === "string");
      });
      expect(dbNames).toContain("simple-budget-app-pr-999");
      expect(dbNames).not.toContain("simple-budget-app");

      const cacheKeys = await prPage.evaluate(async () => caches.keys());
      expect(
        cacheKeys.some((key) => /^sbapp-pr-999-[0-9a-f]{12}$/.test(key)),
        `Expected PR-preview cache matching sbapp-pr-999-<hash>, got: ${cacheKeys.join(", ")}`,
      ).toBe(true);

      await assertZeroAxeViolations(prPage, "pr-preview-isolation");
      await assertZeroViewportOverflow(prPage, "pr-preview-isolation");
      await assertTouchTargetGeometry(prPage, "button:visible");
    } finally {
      await prContext.close();
    }

    expect(disallowedRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleIssues).toEqual([]);
  });
});
