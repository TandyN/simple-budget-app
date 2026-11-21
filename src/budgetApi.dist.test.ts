/**
 * `dist/` smoke import test (V3, #259).
 *
 * `project-plan/testing.md → The Test Pyramid, layer 2 (E2E & Regression)`:
 * for a pure-backend slice with no UI shell yet, the interim regression test
 * is a Vitest integration test that runs the build, imports `createBudgetApi`
 * **from the built `dist/` output** (not from `src/`), and exercises a
 * minimal `init()` → `addRule` → `runRecurringEngine` → `listActivities`
 * round-trip against the built output.
 *
 * **Mechanism (see `package.json` scripts):** `pnpm run build` runs
 * `build:lib` → `build:spa`. The lib build
 * (`vite build --config vite.lib.config.ts`) emits `dist/budgetApi.es.js`
 * and empties `dist/` first (Vite's default `emptyOutDir: true` for
 * same-dir output). The SPA build then runs with `emptyOutDir: false`
 * (see `vite.config.ts`), so it adds `dist/index.html` + `dist/assets/`
 * **without** deleting the lib bundle. This test builds the lib bundle once
 * in `beforeAll` (a failed build fails the test) and imports
 * `createBudgetApi` from the resulting `dist/budgetApi.es.js` — proving the
 * built artifact is a working ES module.
 *
 * **Adapter injection:** the smoke round-trip passes the `InMemoryAdapter`
 * from `src/storage/memory.ts` as the dependency-injected `adapter` option.
 * That keeps the test free of IndexedDB (and of `fake-indexeddb`) while
 * still exercising the exact public `BudgetApi` contract the front-end
 * calls; the adapter is an injected argument, not part of the public
 * surface under test.
 *
 * **Gate compatibility:** the built bundle must contain **zero** external
 * `http://`/`https://` URLs (Gate 3 walks *all* `dist/` files) and no banned
 * sinks (Gate 4 scans non-test `src/` files; this `*.test.ts` file is
 * skipped by Gate 4's `TEST_FILE_RE`, and its `node:child_process` /
 * `node:fs` usage is a build-time test harness, never shipped to a browser).
 */
/// <reference types="node" />
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { createBudgetApi } from "./index";
import { InMemoryAdapter } from "./storage/memory";

/** Repository root (this file lives in `src/`). */
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** The built lib entry under test (NOT the `src/` source). */
const DIST_ENTRY = path.join(repoRoot, "dist", "budgetApi.es.js");

let createBuiltApi: typeof createBudgetApi;

beforeAll(async () => {
  // Build the lib bundle. A failed build must fail the test — the whole
  // point of this smoke test is the *built* artifact.
  execSync("pnpm run build:lib", { cwd: repoRoot, stdio: "inherit" });

  // Assert the artifact exists (the acceptance criterion is that
  // `import { createBudgetApi } from "<dist output>"` resolves).
  expect(
    existsSync(DIST_ENTRY),
    `expected ${path.relative(repoRoot, DIST_ENTRY)} to exist after "pnpm run build:lib"`,
  ).toBe(true);

  // Import the public entry from the **built** bundle (Node treats `*.js`
  // under a `"type": "module"` package as an ES module).
  const mod = await import(/* @vite-ignore */ pathToFileURL(DIST_ENTRY).href);
  createBuiltApi = mod.createBudgetApi;
});

describe("dist/ smoke round-trip (V3, #259)", () => {
  it("exposes createBudgetApi from the built dist/ output", () => {
    expect(typeof createBuiltApi).toBe("function");
  });

  it("init() → addRule → runRecurringEngine → listActivities round-trips against the built bundle", async () => {
    const api = createBuiltApi({ adapter: new InMemoryAdapter() });

    // 1. init() — opens the store; idempotent.
    await api.init();
    await expect(api.init()).resolves.toBeUndefined();
    await expect(api.listRules()).resolves.toEqual([]);
    await expect(api.listActivities()).resolves.toEqual([]);

    // 2. addRule — creates a recurring income rule.
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });
    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe("Salary");
    expect(rule.type).toBe("income");
    expect(rule.amountCents).toBe(500_000);
    expect(rule.lastPostPeriod).toBeNull();

    // 3. runRecurringEngine(now) — posts the due period(s) as of `now`.
    //    Deterministic: with `dayOfMonth: 1` and `now` on the 15th, the
    //    current period's due instant (day 1 @ 12:00:00Z) has already
    //    passed, so exactly one activity is posted for the current period.
    const now = new Date("2026-11-15T00:00:00.000Z");
    const { posted } = await api.runRecurringEngine(now);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.source).toBe("recurring");
    expect(posted[0]?.sourceRuleId).toBe(rule.id);
    expect(posted[0]?.type).toBe("income");
    expect(posted[0]?.amountCents).toBe(500_000);
    expect(posted[0]?.period).toBe("2026-11");

    // Idempotency: a second run at the same `now` posts nothing new.
    const { posted: secondRun } = await api.runRecurringEngine(now);
    expect(secondRun).toHaveLength(0);

    // 4. listActivities — the round-trip: the posted activity is visible.
    const activities = await api.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.id).toBe(posted[0]?.id);
    expect(activities[0]?.source).toBe("recurring");
    expect(activities[0]?.sourceRuleId).toBe(rule.id);

    // 5. getAvailableFunds — the derived value reflects the posted income.
    const funds = await api.getAvailableFunds();
    expect(funds).toBe(500_000);
  });
});
