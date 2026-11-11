import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  page = await browser.newPage();
try {
  await page.goto("http://127.0.0.1:5173/");
  await page
    .locator(".left-sidebar")
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .waitFor();
  const data = await page.evaluate(async () => {
    const { loadCatalog } = await import("/src/core/catalog.ts"),
      { blankScene } = await import("/src/core/types.ts"),
      { addObject } = await import("/src/core/commands.ts"),
      { makeCandidates } = await import("/src/core/composition.ts"),
      { exportScene } = await import("/src/core/svg.ts");
    const { catalog, assets } = await loadCatalog(
        new AbortController().signal,
        () => {},
      ),
      results = [];
    const p95 = (times) =>
      [...times].sort((a, b) => a - b)[Math.ceil(times.length * 0.95) - 1];
    for (const count of [1, 10, 25, 50]) {
      let scene = blankScene(catalog);
      for (let i = 0; i < count; i++)
        scene = addObject(
          scene,
          catalog.families[i % catalog.families.length].id,
          catalog,
        );
      const times = [];
      let bytes = 0;
      for (let i = 0; i < 25; i++) {
        const start = performance.now(),
          svg = exportScene(scene, catalog, assets);
        times.push(performance.now() - start);
        bytes = svg.length;
      }
      results.push({
        objects: count,
        exports: 25,
        p95Ms: p95(times),
        maxMs: Math.max(...times),
        svgBytes: bytes,
      });
    }
    const times = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      makeCandidates(
        { ...blankScene(catalog), seed: i },
        ["headphones", "book", "phone"],
        catalog,
      );
      times.push(performance.now() - start);
    }
    return {
      export: results,
      composition: {
        samples: 100,
        p95Ms: p95(times),
        maxMs: Math.max(...times),
      },
      browser: navigator.userAgent,
    };
  });
  await mkdir("verification", { recursive: true });
  const report = {
    ...data,
    environment: {
      node: process.version,
      platform: os.platform(),
      cpu: os.cpus()[0].model,
      logicalCPUs: os.cpus().length,
    },
    date: new Date().toISOString(),
  };
  await writeFile(
    "verification/re-audit-0.1.1-2026-11-11/benchmark.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

