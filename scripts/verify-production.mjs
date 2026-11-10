import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4173/");
  await page
    .locator(".left-sidebar")
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await page.locator(".interactive-scene [data-instance]").first().waitFor();
  const before = await page
    .locator(".interactive-scene")
    .evaluate((n) => n.outerHTML);
  for (let i = 0; i < 20; i++) {
    await page
      .locator(".right-sidebar")
      .getByRole("button", {
        name: i % 2 ? "L Больше деталей" : "S Меньше деталей",
        exact: false,
      })
      .click();
    await page
      .getByRole("button", { name: i % 2 ? "Лиловая" : "Мятная", exact: false })
      .click();
  }
  const after = await page
    .locator(".interactive-scene")
    .evaluate((n) => n.outerHTML);
  if (before !== after)
    throw new Error("Palette/detail round trip changed the scene SVG");
  const comparisons = [];
  for (const format of ["16:9", "1:1", "4:5"]) {
    await page.getByRole("button", { name: format, exact: true }).click();
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Скачать SVG", exact: true })
      .click();
    const exported = await readFile(await (await event).path(), "utf8");
    const comparison = await page
      .locator(".interactive-scene")
      .evaluate(async (live, exported) => {
        const view = live.viewBox.baseVal,
          clone = live.cloneNode(true);
        clone.setAttribute("width", view.width);
        clone.setAttribute("height", view.height);
        const strings = [
            new XMLSerializer().serializeToString(clone),
            exported,
          ],
          images = await Promise.all(
            strings.map(
              (source) =>
                new Promise((resolve, reject) => {
                  const image = new Image();
                  image.onload = () => resolve(image);
                  image.onerror = reject;
                  image.src =
                    "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(source);
                }),
            ),
          ),
          width = 400,
          height = Math.round((400 * view.height) / view.width);
        const pixels = images.map((image) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        });
        let error = 0;
        for (let i = 0; i < pixels[0].length; i++)
          error += Math.abs(pixels[0][i] - pixels[1][i]);
        return {
          width,
          height,
          meanAbsolutePixelDifference: error / pixels[0].length,
        };
      }, exported);
    if (comparison.meanAbsolutePixelDifference > 0.1)
      throw new Error("Preview/export mismatch: " + JSON.stringify(comparison));
    comparisons.push({ format, ...comparison });
  }
  await mkdir("verification", { recursive: true });
  const report = {
    productionOrigin: "http://127.0.0.1:4173",
    roundTrips: 20,
    unchanged: true,
    comparisons,
    errors,
  };
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    "verification/production.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
