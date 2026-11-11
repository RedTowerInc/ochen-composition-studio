import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({testDir:'../../tests/e2e',fullyParallel:true,workers:1,retries:0,timeout:30000,expect:{timeout:7000},
 outputDir:'./legacy-final-traces',reporter:[['list'],['json',{outputFile:'legacy-final.json'}]],
 use:{baseURL:'http://127.0.0.1:4178',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/serve-preview.mjs',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:4178',env:{PORT:'4178'},reuseExistingServer:false,timeout:15000},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome'],channel:'chrome'}},{name:'firefox',use:{...devices['Desktop Firefox']},testIgnore:/extremes/}]
});

