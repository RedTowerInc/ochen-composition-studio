import { chromium } from "@playwright/test";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("examples", { recursive: true });
await mkdir("verification/visual-matrix", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: {
    dir: "test-results/demo",
    size: { width: 1440, height: 1000 },
  },
});
const page = await context.newPage();
const left = page.locator(".left-sidebar"),
  right = page.locator(".right-sidebar");
const save = async (name, type) => {
  const event = page.waitForEvent("download");
  if (type === "svg")
    await page
      .getByRole("button", { name: "Скачать SVG", exact: true })
      .click();
  else {
    await page.locator(".project-menu summary").click();
    await page
      .getByRole("button", { name: "Скачать проект JSON", exact: true })
      .click();
  }
  await (
    await event
  ).saveAs(`examples/${name}.${type === "svg" ? "svg" : "composition.json"}`);
  if (type !== "svg") await page.locator(".project-menu summary").click();
};
try {
  await page.goto("http://127.0.0.1:5173/");
  await left
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .waitFor();
  for (const [index, input, format, palette, detail, name] of [
    [1, "Сосредоточиться на главном", "16:9", "Лиловая", "L", "focus"],
    [2, "Лампа, Пазлы, Ручка", "1:1", "Мятная", "S", "ideas"],
    [3, "Книга, Цветы, Наушники", "4:5", "Персиковая", "L", "balance"],
  ]) {
    if (index > 1) {
      await page.locator(".project-menu summary").click();
      await page
        .getByRole("button", { name: "Новая композиция", exact: true })
        .click();
    }
    await right.getByRole("button", { name: format, exact: true }).click();
    await right.getByRole("button", { name: palette, exact: false }).click();
    await right
      .getByRole("button", {
        name: detail === "S" ? "S Меньше деталей" : "L Больше деталей",
        exact: false,
      })
      .click();
    await left
      .getByRole("button", {
        name: index === 1 ? "По смыслу" : "По объектам",
        exact: true,
      })
      .click();
    await left.locator("textarea").fill(input);
    await page
      .getByLabel("Название проекта")
      .fill(
        ["Фокус на главном", "Место для новых идей", "Время для себя"][
          index - 1
        ],
      );
    await left
      .getByRole("button", { name: "Собрать композицию", exact: true })
      .click();
    await page.locator(".interactive-scene [data-instance]").first().waitFor();
    if (index === 2) await page.locator(".candidate-card").nth(1).click();
    await page.waitForTimeout(900); // A short pause makes the recorded real workflow readable.
    await save(name, "svg");
    await save(name, "json");
    await page
      .locator(".interactive-scene")
      .screenshot({ path: `examples/${name}.png` });
    if (index === 1) {
      await page.screenshot({
        path: "examples/studio-desktop.png",
        fullPage: true,
      });
      await left.getByRole("button", { name: "Слои", exact: true }).click();
      await left.locator(".layer-select").first().click();
      await right.getByLabel("Поворот объекта").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(700);
      await page
        .getByRole("button", { name: "Отменить действие", exact: true })
        .click();
      await left.getByRole("button", { name: "Собрать", exact: true }).click();
    }
  }
  const video = page.video();
  await context.close();
  await video.saveAs("examples/demo.webm");
  const matrixContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    matrix = await matrixContext.newPage();
  await matrix.goto("http://127.0.0.1:5173/");
  await matrix
    .locator(".left-sidebar")
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await matrix.locator(".interactive-scene [data-instance]").first().waitFor();
  const checks = [];
  for (const detail of ["S", "L"])
    for (const palette of ["Лиловая", "Персиковая", "Мятная"])
      for (const format of ["16:9", "1:1", "4:5"]) {
        await matrix
          .locator(".right-sidebar")
          .getByRole("button", {
            name: detail === "S" ? "S Меньше деталей" : "L Больше деталей",
            exact: false,
          })
          .click();
        await matrix
          .getByRole("button", { name: palette, exact: false })
          .click();
        await matrix.getByRole("button", { name: format, exact: true }).click();
        const filename = `${detail}-${["Лиловая", "Персиковая", "Мятная"].indexOf(palette)}-${format.replace(":", "-")}.png`;
        await matrix
          .locator(".interactive-scene")
          .screenshot({ path: "verification/visual-matrix/" + filename });
        checks.push({ detail, palette, format, filename });
      }
  await writeFile(
    "verification/visual-matrix/checks.json",
    JSON.stringify(checks, null, 2),
  );
  await matrixContext.close();
  console.log(
    JSON.stringify({
      examples: 3,
      visualChecks: checks.length,
      video: "examples/demo.webm",
    }),
  );
} finally {
  await browser.close();
}
