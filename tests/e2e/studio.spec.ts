import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const sidebar = (page: Page) => page.locator(".left-sidebar");
const objects = (page: Page) =>
  page.locator(".interactive-scene [data-instance]");
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    sidebar(page).getByRole("button", {
      name: "Собрать композицию",
      exact: true,
    }),
  ).toBeVisible();
}
async function generate(page: Page) {
  await sidebar(page)
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await expect(objects(page)).toHaveCount(4);
}
async function project(page: Page) {
  await page.locator(".project-menu summary").click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать проект JSON", exact: true })
    .click();
  const file = await event;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}
async function svg(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать SVG", exact: true }).click();
  return readFile((await (await event).path())!, "utf8");
}

test("compose, edit, undo, switch original variants and palettes, export and restore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await generate(page);
  await expect(
    page.getByRole("button", { name: "Лиловая", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await expect(
    page.locator(".right-sidebar").getByLabel("Ширина холста"),
  ).toHaveValue("1000");
  await page
    .getByRole("button", { name: "S Меньше деталей", exact: false })
    .click();
  await page.getByRole("button", { name: "Персиковая", exact: false }).click();
  await sidebar(page)
    .getByRole("button", { name: "Слои", exact: true })
    .click();
  await sidebar(page).locator(".layer-select").first().click();
  await page.getByRole("button", { name: "Дубликат", exact: true }).click();
  await expect(objects(page)).toHaveCount(5);
  await page
    .getByRole("button", { name: "Удалить объект", exact: true })
    .click();
  await expect(objects(page)).toHaveCount(4);
  await page
    .getByRole("button", { name: "Отменить действие", exact: true })
    .click();
  await expect(objects(page)).toHaveCount(5);
  const exported = await svg(page);
  expect(exported).toContain('width="1000"');
  expect(exported).toContain("#FDD7B9");
  expect(exported).not.toMatch(/<image|<script|https?:\/\/(?!www.w3.org)/);
  const before = await project(page);
  await expect(
    page.getByText("Сохранено в браузере", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(objects(page)).toHaveCount(5);
  const after = await project(page);
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test("unknown input and invalid palette/project leave the current scene intact", async ({
  page,
}) => {
  await ready(page);
  await generate(page);
  const before = await project(page);
  await page.locator(".project-menu summary").click();
  await sidebar(page)
    .getByRole("button", { name: "По объектам", exact: true })
    .click();
  await sidebar(page).locator("textarea").fill("самолёт");
  await sidebar(page)
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Не найдены");
  await page.locator(".right-sidebar input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("alert")).toContainText("JSON");
  expect((await project(page)).instances).toEqual(before.instances);
  await page.locator(".project-menu summary").click();
  await page.locator(".studio-header input[type=file]").setInputFiles({
    name: "bad-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...before,
        instances: [{ ...before.instances[0], familyId: "unknown" }],
      }),
    ),
  });
  await expect(page.getByRole("alert")).toContainText("Неизвестный объект");
  await expect(objects(page)).toHaveCount(4);
});

test("two real tabs cannot silently overwrite one shared project", async ({
  page,
  context,
}) => {
  await ready(page);
  await generate(page);
  await expect(
    page.getByText("Сохранено в браузере", { exact: true }),
  ).toBeVisible();
  const other = await context.newPage();
  await ready(other);
  await expect(objects(other)).toHaveCount(4);
  await page.getByLabel("Название проекта").fill("Версия A");
  await page.getByLabel("Название проекта").press("Enter");
  await expect(
    page.getByText("Сохранено в браузере", { exact: true }),
  ).toBeVisible();
  await other.getByLabel("Название проекта").fill("Версия B");
  await other.getByLabel("Название проекта").press("Enter");
  await expect(other.locator(".storage-banner")).toContainText(
    "другой вкладке",
  );
  await expect(other.getByLabel("Название проекта")).toHaveValue("Версия B");
  await other
    .getByRole("button", { name: "Сохранить отдельно", exact: true })
    .first()
    .click();
  await expect(other.locator(".storage-banner")).toHaveCount(0);
  await expect(other.getByLabel("Название проекта")).toHaveValue(
    "Версия B — копия",
  );
  await expect(page.getByLabel("Название проекта")).toHaveValue("Версия A");
});

test("drag is one undoable command and pointercancel rolls back preview", async ({
  page,
}) => {
  await ready(page);
  await generate(page);
  await sidebar(page)
    .getByRole("button", { name: "Слои", exact: true })
    .click();
  await sidebar(page).locator(".layer-select").first().click();
  const before = await project(page);
  await page.locator(".project-menu summary").click();
  const selected = objects(page).filter({
    has: page.locator('rect[vector-effect="non-scaling-stroke"]'),
  });
  const box = await selected.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.5,
    y = box!.y + box!.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 30, y - 20, { steps: 4 });
  await page.mouse.up();
  const changed = await project(page);
  expect(changed.revision).toBe(before.revision + 1);
  await page.locator(".project-menu summary").click();
  await page
    .getByRole("button", { name: "Отменить действие", exact: true })
    .click();
  expect((await project(page)).instances).toEqual(before.instances);
});

test("local storage failure and offline editing keep SVG export available", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("Storage disabled", "SecurityError");
    } as typeof indexedDB.open;
  });
  await ready(page);
  await generate(page);
  await expect(page.locator(".storage-banner")).toContainText("недоступно");
  await context.setOffline(true);
  expect(await svg(page)).toContain("<path");
});

for (const width of [1440, 1280, 1024, 768, 390, 320])
  test(`all mandatory controls remain reachable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    if (width < 800) {
      await page
        .getByRole("button", { name: "Сборка и объекты", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Собрать композицию", exact: true })
        .click();
      await expect(objects(page)).toHaveCount(4);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Закрыть панель", exact: true })
        .click();
    } else await generate(page);
    if (width < 1100) {
      await page
        .getByRole("button", { name: "Параметры", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Загрузить JSON-палитру", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    } else
      await expect(
        page.getByRole("button", { name: "Загрузить JSON-палитру", exact: true }),
      ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Скачать SVG", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/preview/studio-${width}.png`,
      fullPage: true,
    });
  });

test("role, rotation, layer changes and deleting every object remain undoable", async ({
  page,
}) => {
  await ready(page);
  await generate(page);
  await sidebar(page)
    .getByRole("button", { name: "Слои", exact: true })
    .click();
  await sidebar(page).locator(".layer-select").first().click();
  await page.locator(".right-sidebar select").selectOption("background");
  await page.locator(".right-sidebar").getByLabel("Поворот объекта").focus();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Ниже", exact: true }).click();
  const changed = await project(page);
  const item = changed.instances[2];
  expect(item.role).toBe("background");
  expect(Math.abs(item.rotation)).toBe(180);
  await page.locator(".project-menu summary").click();
  for (let i = 0; i < 4; i++) {
    await sidebar(page).locator(".layer-select").first().click();
    await page
      .getByRole("button", { name: "Удалить объект", exact: true })
      .click();
  }
  await expect(objects(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Скачать SVG", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Отменить действие", exact: true })
    .click();
  await expect(objects(page)).toHaveCount(1);
  await page
    .getByRole("button", { name: "Повторить действие", exact: true })
    .click();
  await expect(objects(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Отменить действие", exact: true })
    .click();
  await sidebar(page)
    .getByRole("button", { name: "Объекты", exact: true })
    .click();
  await sidebar(page).locator(".object-card").first().click();
  await expect(objects(page)).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Повторить действие", exact: true }),
  ).toBeDisabled();
});

test("drag coordinates stay correct after zoom, scroll and viewport resize", async ({
  page,
}) => {
  await ready(page);
  await generate(page);
  await page
    .getByRole("button", { name: "Увеличить масштаб", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Увеличить масштаб", exact: true })
    .click();
  await page.setViewportSize({ width: 1024, height: 850 });
  await page.locator(".canvas-area").evaluate((element) => {
    element.scrollLeft = 60;
    element.scrollTop = 40;
  });
  const before = await project(page);
  await page.locator(".project-menu summary").click();
  const point = await page.locator(".interactive-scene").evaluate((svg) => {
    const rect = svg.getBoundingClientRect(),
      area = svg.closest(".canvas-area")!.getBoundingClientRect();
    for (
      let y = Math.max(rect.top, area.top) + 12;
      y < Math.min(rect.bottom, area.bottom) - 25;
      y += 12
    )
      for (
        let x = Math.max(rect.left, area.left) + 12;
        x < Math.min(rect.right, area.right) - 25;
        x += 12
      ) {
        const element = document
          .elementFromPoint(x, y)
          ?.closest("[data-instance]");
        if (element)
          return {
            x,
            y,
            id: element.getAttribute("data-instance"),
            width: rect.width,
            height: rect.height,
          };
      }
    throw new Error("No visible object point");
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 15, point.y + 12, { steps: 4 });
  await page.mouse.up();
  const after = await project(page),
    oldItem = before.instances.find((i: any) => i.id === point.id),
    newItem = after.instances.find((i: any) => i.id === point.id);
  expect(newItem.x - oldItem.x).toBeCloseTo(15 / point.width, 5);
  expect(newItem.y - oldItem.y).toBeCloseTo(12 / point.height, 5);
});

test("closing before an uncommitted autosave preserves the previous commit", async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date("2026-11-10T12:00:00Z") });
  await ready(page);
  await generate(page);
  await expect(
    page.getByText("Сохранено в браузере", { exact: true }),
  ).toBeVisible();
  const saved = await project(page);
  await page.locator(".project-menu summary").click();
  await page.clock.pauseAt(new Date("2026-11-10T13:00:00Z"));
  await objects(page).first().focus();
  await page
    .locator(".right-sidebar")
    .getByRole("button", { name: "Дубликат", exact: true })
    .click();
  await expect(objects(page)).toHaveCount(saved.instances.length + 1);
  page.once("dialog", (dialog) => dialog.accept());
  const closed = page.waitForEvent("close");
  await page.close({ runBeforeUnload: true });
  await closed;
  const restored = await context.newPage();
  await ready(restored);
  await expect(restored.getByLabel("Название проекта")).toHaveValue(saved.name);
  await expect(objects(restored)).toHaveCount(saved.instances.length);
  expect(await project(restored)).toEqual(saved);
});
