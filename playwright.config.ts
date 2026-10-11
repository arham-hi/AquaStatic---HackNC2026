import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined, launchOptions: { args: ["--enable-unsafe-swiftshader"] } },
  webServer: {
    command: "npm run e2e:server",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" }, testMatch: /mobile\.spec\.ts/ },
  ],
});
