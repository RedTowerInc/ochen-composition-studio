import { defineConfig, devices } from "@playwright/test";

const run = process.env.OCHEN_AUDIT_RUN ?? "latest";
if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error("Invalid audit run name");
const output = `verification/remediation/${run}`;
const port = Number(process.env.OCHEN_TEST_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid test port");
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/regression/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20000,
  expect: { timeout: 2500 },
  outputDir: `${output}/traces`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${output}/browser`, open: "never" }],
    ["json", { outputFile: `${output}/browser.json` }],
  ],
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve-preview.mjs",
    url: origin,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 15000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
