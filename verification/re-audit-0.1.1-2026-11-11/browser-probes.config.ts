import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({testDir:'.',testMatch:'browser-probes.spec.ts',workers:1,retries:0,timeout:20000,expect:{timeout:1500},
 outputDir:'./probe-traces',reporter:[['list'],['json',{outputFile:'browser-probes.json'}]],
 use:{baseURL:'http://127.0.0.1:4179',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/serve-preview.mjs',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:4179',env:{PORT:'4179'},reuseExistingServer:false,timeout:15000},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome'],channel:'chrome'}},{name:'firefox',use:{...devices['Desktop Firefox']}}]
});
