import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ["**/verification/**", "**/playwright-report/**", "**/test-results/**"] } },
  test: { include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"] },
  build: { sourcemap: true },
});
