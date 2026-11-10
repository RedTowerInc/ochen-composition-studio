import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("test-results/preview", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .first()
    .click();
  await page.locator(".interactive-scene [data-instance]").first().waitFor();
  await page.screenshot({
    path: "test-results/preview/studio-1440.png",
    fullPage: true,
  });
  await writeFile(
    "test-results/preview/smoke.json",
    JSON.stringify(
      {
        objects: await page
          .locator(".interactive-scene [data-instance]")
          .count(),
        errors,
        title: await page.title(),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      errors,
      objects: await page.locator(".interactive-scene [data-instance]").count(),
    }),
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/preview/failure.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({ errors, text: await page.locator("body").innerText() }),
  );
  throw error;
} finally {
  await browser.close();
}
