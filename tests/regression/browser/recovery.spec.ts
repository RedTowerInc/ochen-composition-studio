import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function ready(page: Page) {
  await page.goto("/");
  await page.locator(".left-sidebar textarea").waitFor();
  await page
    .locator(".left-sidebar")
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await expect(page.locator(".interactive-scene [data-instance]")).toHaveCount(
    4,
  );
}

test("N01: invalid XML name cannot replace the scene or poison the next export", async ({
  page,
}) => {
  await ready(page);
  const before = await page.locator(".interactive-scene").innerHTML();
  const title = await page.getByLabel("Название проекта").inputValue();
  const input = JSON.parse(
    await readFile("examples/focus.composition.json", "utf8"),
  );
  input.name = "Плохое\u0000имя";
  await page
    .locator(".studio-header input[type=file]")
    .setInputFiles({
      name: "bad-name.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(input)),
    });
  await expect(page.locator(".notice")).toContainText("XML");
  expect(await page.locator(".interactive-scene").innerHTML()).toBe(before);
  expect(await page.getByLabel("Название проекта").inputValue()).toBe(title);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать SVG", exact: true }).click();
  const xml = await readFile((await (await downloaded).path())!, "utf8");
  expect(
    await page.evaluate(
      (source) =>
        new DOMParser()
          .parseFromString(source, "image/svg+xml")
          .querySelector("parsererror")?.textContent ?? null,
      xml,
    ),
  ).toBeNull();
});

test("S11: a render fault preserves a downloadable project and can recover", async ({
  page,
}) => {
  await ready(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => {
    const owner = window as unknown as {
      originalClone: typeof SVGSVGElement.prototype.cloneNode;
    };
    owner.originalClone = SVGSVGElement.prototype.cloneNode;
    SVGSVGElement.prototype.cloneNode = function () {
      throw new Error("Controlled render failure");
    };
  });
  await page
    .locator(".right-sidebar")
    .getByRole("button", { name: "Персиковая", exact: false })
    .click();
  await expect(page.locator(".render-error")).toContainText(
    "Проект остаётся в памяти",
  );
  const downloaded = page.waitForEvent("download");
  await page
    .locator(".render-error")
    .getByRole("button", { name: "Скачать проект JSON", exact: true })
    .click();
  const backup = JSON.parse(
    await readFile((await (await downloaded).path())!, "utf8"),
  );
  expect(backup.instances).toHaveLength(4);
  expect(backup.palette.colors.background).toBe("#FDD7B9");
  await page.evaluate(() => {
    SVGSVGElement.prototype.cloneNode = (
      window as unknown as {
        originalClone: typeof SVGSVGElement.prototype.cloneNode;
      }
    ).originalClone;
  });
  await page
    .locator(".render-error")
    .getByRole("button", { name: "Повторить загрузку библиотеки", exact: true })
    .click();
  await expect(page.locator(".interactive-scene [data-instance]")).toHaveCount(
    4,
  );
  await page.locator(".project-menu summary").click();
  const after = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать проект JSON", exact: true })
    .click();
  expect(
    JSON.parse(await readFile((await (await after).path())!, "utf8")),
  ).toEqual(backup);
  expect(errors).toEqual([]);
});
