import { defineConfig } from "vite";
import { viteSwPlugin } from "./scripts/vite-sw-plugin.ts";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/simple-budget-app/",
  plugins: [viteSwPlugin()],
  build: {
    // Preserve `dist/budgetApi.es.js` (emitted by the V3 lib build, #259)
    // across the SPA build. Vite defaults `emptyOutDir` to `true` for
    // same-dir output, which would delete the lib bundle before the SPA
    // build's `index.html` + `assets/` are emitted. The CI pipeline and
    // `pnpm run build` therefore rely on this to keep the lib artifact in
    // `dist/` alongside the SPA output.
    emptyOutDir: false,
  },
});
