import { defineConfig, devices } from "@playwright/test";
const run = process.env.OCHEN_E2E_RUN ?? "latest";
if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error("Invalid e2e run name");
const output = `verification/e2e/${run}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // The CPU-throttled case must not compete with other test workers.
  workers: 1,
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: [["list"], ["html", { outputFolder: `${output}/browser`, open: "never" }], ["json", { outputFile: `${output}/browser.json` }]],
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
