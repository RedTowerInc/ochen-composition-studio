import { defineConfig } from "vitest/config";

const run = process.env.OCHEN_AUDIT_RUN ?? "latest";
if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error("Invalid audit run name");

export default defineConfig({
  test: {
    include: ["tests/regression/unit/**/*.test.ts"],
    environment: "jsdom",
    reporters: ["default", "json"],
    outputFile: `verification/remediation/${run}/unit.json`,
  },
});
