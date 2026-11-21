/**
 * Vite **library** build for the public API entry (`src/index.ts`).
 *
 * `project-plan/portability.md → Module layout`: `src/index.ts` is the "door
 * the front-end walks in through" — `createBudgetApi` + the key public types.
 * This config emits it as a self-contained ES module at
 * `dist/budgetApi.es.js` (the **V3** library entry, #259), so the built
 * bundle is importable directly (e.g. by the `dist/` smoke round-trip test,
 * `src/budgetApi.dist.test.ts`).
 *
 * **Build-order contract (important):** `pnpm run build` runs this lib build
 * *before* the SPA build (`vite build`). Vite's SPA build defaults to
 * `emptyOutDir: true` and would otherwise delete `dist/budgetApi.es.js` —
 * running the lib build last would make `verify:gates` (Gate 3, which walks
 * all of `dist/`) see a stale/missing lib artifact. Order: lib first, SPA
 * last. The SPA `dist/index.html` + `assets/` output is byte-for-byte the
 * SPA build's own output (the lib file simply coexists in `dist/`).
 *
 * **Gate compatibility (`scripts/verify-build-gates.mjs`):**
 * - Gate 3 (zero external http(s) URLs in `dist/`): the lib bundle contains
 *   zero external URLs — the sources only use Web-platform built-ins and the
 *   sole `https://` occurrence in `src/` is a doc-comment in
 *   `src/storage/indexeddb.ts`, which tree-shaking strips.
 * - Gate 4 (banned sinks in non-test `src/`): this test is in a test file
 *   (`*.test.ts`) and Gate 4 skips test files; `execSync` is a Node global
 *   used at *build* time only, never shipped to a browser.
 * - No `eval` / `new Function` / `Function(` appear in any non-test `src/`
 *   file, so the banned-sink gate holds.
 *
 * `project-plan/dependency-strategy.md`: zero production dependencies — the
 * build uses only `vite` (devDependency) and Node built-ins.
 */
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: (_format) => "budgetApi.es.js",
    },
    outDir: "dist",
    // No `external` list: the library is self-contained (zero production
    // dependencies — `project-plan/dependency-strategy.md`), so every import
    // is a relative path under `src/` and Rollup inlines them all into the
    // single ES module.
  },
});
