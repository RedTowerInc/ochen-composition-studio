import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['verification/re-audit-0.1.1-2026-11-11/probes.test.ts'],reporters:['default','json'],outputFile:'verification/re-audit-0.1.1-2026-11-11/probes.json'}});
