import { defineConfig } from "@playwright/test";

// Golden path E2E against MOCK=1 + DEMO_MODE=1: no keys, no network, every route serves the fixture.
// Default serves a production build; E2E_DEV=1 uses `next dev` instead (faster start, slower first page loads).
const PORT = Number(process.env.E2E_PORT ?? 3137);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure", acceptDownloads: true },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: process.env.E2E_DEV ? `npx next dev -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    env: { MOCK: "1", DEMO_MODE: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
