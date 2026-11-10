import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 3,
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "verification/remediation/legacy-final.json" }]],
  use: {
    baseURL: process.env.OCHEN_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: /extremes/,
    },
  ],
});
