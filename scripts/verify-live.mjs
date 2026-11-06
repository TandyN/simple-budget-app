#!/usr/bin/env node
// verify-live.mjs — Post-deploy QA script that verifies the live GitHub Pages site
// (https://tandyn.github.io/simple-budget-app/) serves the expected version, renders
// on both iPhone Duo folded and unfolded viewports in WebKit, and works 100% offline.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from '@playwright/test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_URL = process.env.LIVE_URL ?? 'https://tandyn.github.io/simple-budget-app/';

const args = process.argv.slice(2);
const expectVersionIdx = args.indexOf('--expect-version');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const expectedVersion = expectVersionIdx >= 0 ? args[expectVersionIdx + 1] : pkg.version;

const DUO_VIEWPORTS = [
  { name: 'iphone-duo-folded', width: 466, height: 678 },
  { name: 'iphone-duo-unfolded', width: 626, height: 890 },
];

async function waitForLiveVersion(timeoutMs = 120_000) {
  const start = Date.now();
  const versionUrl = new URL('version.json', LIVE_URL).toString();
  console.log(`▶ Waiting for ${versionUrl} to report v${expectedVersion}...`);

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${versionUrl}?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const body = await response.json();
        if (body.version === expectedVersion) {
          console.log(`  ✓ Live version.json matched: v${body.version} (commit ${body.commit})`);
          return body;
        }
        console.log(`  … Currently serving v${body.version}, waiting for v${expectedVersion}`);
      }
    } catch {
      // Site may still be building on first deploy
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Timed out waiting for ${versionUrl} to serve v${expectedVersion}`);
}

async function verifyInWebKit() {
  const browser = await webkit.launch();
  try {
    for (const vp of DUO_VIEWPORTS) {
      console.log(
        `▶ Verifying live app + offline mode on ${vp.name} (${vp.width}×${vp.height})...`,
      );
      const context = await browser.newContext({
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

      const statusLocator = page.getByRole('contentinfo', { name: 'App status' });
      await statusLocator.waitFor({ state: 'visible', timeout: 15_000 });
      const statusText = (await statusLocator.textContent()) ?? '';
      if (!statusText.includes(`Version v${expectedVersion}`)) {
        throw new Error(
          `Expected status to include 'Version v${expectedVersion}', got '${statusText}'`,
        );
      }

      // Wait for Service Worker to activate and report 'Offline ready'
      await page.waitForFunction(
        () => document.body.innerText.includes('Offline ready'),
        undefined,
        { timeout: 15_000 },
      );

      // Go offline and reload to prove the live PWA works with zero network
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });

      const offlineHeading = await page.getByRole('heading', { level: 1 }).textContent();
      const offlineStatus = (await statusLocator.textContent()) ?? '';
      if (offlineHeading !== 'Simple Budget' || !offlineStatus.includes('Working offline')) {
        throw new Error(
          `Offline reload failed on ${vp.name}: heading='${String(offlineHeading)}', status='${offlineStatus}'`,
        );
      }
      console.log(`  ✓ ${vp.name}: rendered v${expectedVersion} online and reloaded 100% offline!`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

await waitForLiveVersion();
await verifyInWebKit();
console.log(`✓ Live QA passed for Simple Budget v${expectedVersion} at ${LIVE_URL}`);
