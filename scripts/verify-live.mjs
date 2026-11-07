#!/usr/bin/env node
// verify-live.mjs — Post-deploy QA script that verifies the live GitHub Pages site
// (https://tandyn.github.io/simple-budget-app/) serves the expected commit/version, renders
// on both iPhone Duo folded and unfolded viewports in WebKit, and works 100% offline
// (verified via CacheStorage in WebKit and full offline reload in Chromium).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/tmp/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/tmp/pw-browsers';
}
process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ??= 'ubuntu24.04-x64';

const { chromium, webkit } = await import('@playwright/test');

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_URL = process.env.LIVE_URL ?? 'https://tandyn.github.io/simple-budget-app/';

const args = process.argv.slice(2);
const expectVersionIdx = args.indexOf('--expect-version');
const expectCommitIdx = args.indexOf('--expect-commit');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const expectedVersion = expectVersionIdx >= 0 ? args[expectVersionIdx + 1] : pkg.version;
const headShortSha = execSync('git rev-parse --short HEAD', {
  cwd: rootDir,
  encoding: 'utf8',
}).trim();
const expectedCommit =
  expectCommitIdx >= 0 ? args[expectCommitIdx + 1] : expectVersionIdx >= 0 ? null : headShortSha;

const DUO_VIEWPORTS = [
  { name: 'iphone-duo-folded', width: 466, height: 678 },
  { name: 'iphone-duo-unfolded', width: 626, height: 890 },
];

async function waitForLiveVersion(timeoutMs = 120_000) {
  const start = Date.now();
  const versionUrl = new URL('version.json', LIVE_URL).toString();
  const targetDesc = expectedCommit
    ? `v${expectedVersion} (${expectedCommit})`
    : `v${expectedVersion}`;
  console.log(`▶ Waiting for ${versionUrl} to report ${targetDesc}...`);

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${versionUrl}?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const body = await response.json();
        const versionMatches = body.version === expectedVersion;
        const commitMatches = !expectedCommit || body.commit === expectedCommit;
        if (versionMatches && commitMatches) {
          console.log(`  ✓ Live version.json matched: v${body.version} (commit ${body.commit})`);
          return body;
        }
        console.log(
          `  … Currently serving v${body.version} (${body.commit}), waiting for ${targetDesc}`,
        );
      }
    } catch {
      // Site may still be building on first deploy
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Timed out waiting for ${versionUrl} to serve ${targetDesc}`);
}

async function verifyLiveInWebKitAndChromium() {
  const wkBrowser = await webkit.launch();
  try {
    for (const vp of DUO_VIEWPORTS) {
      console.log(`▶ Verifying live app in WebKit on ${vp.name} (${vp.width}×${vp.height})...`);
      const context = await wkBrowser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.goto(LIVE_URL, { waitUntil: 'networkidle' });

      const heading = await page.getByRole('heading', { level: 1 }).textContent();
      if (heading !== 'Simple Budget') {
        throw new Error(`Expected heading 'Simple Budget', got '${String(heading)}'`);
      }

      const statusLocator = page.getByRole('status', { name: 'App status' });
      await statusLocator.waitFor({ state: 'visible', timeout: 15_000 });
      const statusText = (await statusLocator.textContent()) ?? '';
      if (!statusText.includes(`Version v${expectedVersion}`)) {
        throw new Error(
          `Expected status to include 'Version v${expectedVersion}', got '${statusText}'`,
        );
      }

      await page.waitForFunction(
        () => document.body.innerText.includes('Offline ready'),
        undefined,
        { timeout: 15_000 },
      );

      const swCacheOk = await page.evaluate(async () => {
        const keys = await caches.keys();
        const key = keys.find((k) => k.startsWith('simple-budget-'));
        if (!key) return false;
        const cache = await caches.open(key);
        const indexResp = await cache.match('./index.html');
        return Boolean(indexResp?.ok);
      });
      if (!swCacheOk) {
        throw new Error(`WebKit Service Worker cache missing index.html on ${vp.name}`);
      }
      console.log(
        `  ✓ WebKit ${vp.name}: rendered v${expectedVersion} and populated offline cache`,
      );
      await context.close();
    }
  } finally {
    await wkBrowser.close();
  }

  const crBrowser = await chromium.launch();
  try {
    console.log('▶ Verifying full offline reload of live PWA in Chromium...');
    const context = await crBrowser.newContext({
      viewport: { width: 466, height: 678 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.innerText.includes('Offline ready'), undefined, {
      timeout: 15_000,
    });

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const offlineHeading = await page.getByRole('heading', { level: 1 }).textContent();
    const statusLocator = page.getByRole('status', { name: 'App status' });
    const offlineStatus = (await statusLocator.textContent()) ?? '';
    if (offlineHeading !== 'Simple Budget' || !offlineStatus.includes('Working offline')) {
      throw new Error(
        `Offline reload failed: heading='${String(offlineHeading)}', status='${offlineStatus}'`,
      );
    }
    console.log('  ✓ Live PWA reloaded 100% offline with zero network!');
    await context.close();
  } finally {
    await crBrowser.close();
  }
}

await waitForLiveVersion();
await verifyLiveInWebKitAndChromium();
console.log(`✓ Live QA passed for Simple Budget v${expectedVersion} at ${LIVE_URL}`);
