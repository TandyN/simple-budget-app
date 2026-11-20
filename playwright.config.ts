import { defineConfig } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:4173/simple-budget-app/";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium-folded-375x667",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: "chromium-unfolded-829x1194",
      use: {
        browserName: "chromium",
        viewport: { width: 829, height: 1194 },
      },
    },
    {
      name: "chromium-slab-390x844",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "webkit-folded-375x667",
      use: {
        browserName: "webkit",
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: "webkit-unfolded-829x1194",
      use: {
        browserName: "webkit",
        viewport: { width: 829, height: 1194 },
      },
    },
    {
      name: "webkit-slab-390x844",
      use: {
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
