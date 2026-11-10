import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const shapes = (page: Page) =>
  page.locator(".interactive-scene [data-instance]");
async function ready(page: Page) {
  await page.goto("/");
  await page.locator(".left-sidebar textarea").waitFor();
}
async function compose(page: Page) {
  await page
    .locator(".left-sidebar")
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await expect(shapes(page)).toHaveCount(4);
  await expect(
    page.getByText("Сохранено в браузере", { exact: true }),
  ).toBeVisible();
}
async function projectSnapshot(page: Page) {
  await page.locator(".project-menu summary").click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать проект JSON", exact: true })
    .click();
  const file = await event;
  const result = JSON.parse(await readFile((await file.path())!, "utf8"));
  await page.locator(".project-menu summary").click();
  return result;
}
async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        { id: string; name: string; objects: number; revision: number }[]
      >((resolve, reject) => {
        const request = indexedDB.open("ochen-composition-studio-v1");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("documents")
            .objectStore("documents")
            .getAll();
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            resolve(
              read.result.map((row) => ({
                id: row.id,
                name: row.document.name,
                objects: row.document.instances.length,
                revision: row.document.revision,
              })),
            );
            db.close();
          };
        };
      }),
  );
}

test("RG10 A02: new project waits for the latest scene, even before the debounce", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-10T12:00:00Z") });
  await ready(page);
  await compose(page);
  const previous = (await stored(page))[0];
  await page.clock.pauseAt(new Date("2026-11-10T13:00:00Z"));
  await shapes(page).first().focus();
  await page
    .locator(".right-sidebar")
    .getByRole("button", { name: "Дубликат", exact: true })
    .click();
  await expect(shapes(page)).toHaveCount(5);
  await page.locator(".project-menu summary").click();
  await page
    .getByRole("button", { name: "Новая композиция", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).find((row) => row.id === previous.id)?.objects,
    )
    .toBe(5);
  await expect(shapes(page)).toHaveCount(0);
});

test("RG11 A03: usable canvas at 1366×768, beyond mere button visibility", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await ready(page);
  await compose(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect
    .poll(
      async () =>
        (await page.locator(".interactive-scene").boundingBox())?.width ?? 0,
    )
    .toBeGreaterThanOrEqual(420);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("RG12 A04: invalid local SVG gives a recoverable catalogue error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/catalog/assets/book-L-main.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10L0 10Z" fill="url(#missing)"/></svg>',
    }),
  );
  await page.goto("/");
  await expect
    .poll(
      async () =>
        (await page.locator(".studio-shell").isVisible()) ||
        (await page
          .getByRole("button", { name: "Повторить загрузку", exact: true })
          .isVisible()),
    )
    .toBe(true);
  if (await page.locator(".studio-shell").isVisible()) {
    await page
      .locator(".left-sidebar")
      .getByRole("button", { name: "Собрать композицию", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Повторить загрузку", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.unroute("**/catalog/assets/book-L-main.svg");
  await page
    .getByRole("button", { name: "Повторить загрузку", exact: true })
    .click();
  await page.locator(".left-sidebar textarea").waitFor();
  await compose(page);
});

test("RG13: changing a request invalidates its old candidates", async ({
  page,
}) => {
  await ready(page);
  await compose(page);
  await expect
    .poll(() => page.locator(".candidate-card:not(:disabled)").count())
    .toBeGreaterThan(0);
  await page.locator(".left-sidebar textarea").fill("Цветы");
  await expect(page.locator(".candidate-card:not(:disabled)")).toHaveCount(0);
});

test("RG14: available mode labels have readable contrast", async ({ page }) => {
  await ready(page);
  const ratios = await page.evaluate(() => {
    const rgb = (text: string) =>
      (text.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (c: number[]) =>
      c
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ".segmented button[aria-pressed=false]",
      ".sidebar-tabs button[aria-pressed=false]",
    ].map((selector) => {
      const el = document.querySelector(selector)!;
      let parent: Element | null = el;
      let background = "rgba(0, 0, 0, 0)";
      while (parent && background === "rgba(0, 0, 0, 0)") {
        background = getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      }
      const a = luminance(rgb(getComputedStyle(el).color));
      const b = luminance(rgb(background));
      return {
        selector,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  });
  for (const { selector, ratio } of ratios)
    expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
});

test("RG15 A06: closing before a controlled commit restores exactly the previous commit", async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date("2026-11-10T12:00:00Z") });
  await ready(page);
  await compose(page);
  const previous = (await stored(page))[0];
  await page.clock.pauseAt(new Date("2026-11-10T13:00:00Z"));
  const before = await projectSnapshot(page);
  await shapes(page).first().focus();
  await page
    .locator(".right-sidebar")
    .getByRole("button", { name: "Дубликат", exact: true })
    .click();
  await expect(shapes(page)).toHaveCount(previous.objects + 1);
  expect(
    (await stored(page)).find((row) => row.id === previous.id)?.objects,
  ).toBe(previous.objects);
  page.once("dialog", (dialog) => dialog.accept());
  const closed = page.waitForEvent("close");
  await page.close({ runBeforeUnload: true });
  await closed;
  const reopened = await context.newPage();
  await ready(reopened);
  await expect(reopened.getByLabel("Название проекта")).toHaveValue(
    previous.name,
  );
  await expect(shapes(reopened)).toHaveCount(previous.objects);
  expect(await projectSnapshot(reopened)).toEqual(before);
});
