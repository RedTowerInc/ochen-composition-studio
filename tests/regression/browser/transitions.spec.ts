import { expect, test, type Page } from "@playwright/test";

const objects = (page: Page) =>
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
  await expect(objects(page)).toHaveCount(4);
}
async function saved(page: Page) {
  await expect(
    page.getByText("Сохранено в браузере", { exact: true }),
  ).toBeVisible();
}

test("D03: selecting the already open project never rolls back an unsaved edit", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-10T12:00:00Z") });
  await ready(page);
  await compose(page);
  await saved(page);
  await page.clock.pauseAt(new Date("2026-11-10T13:00:00Z"));
  await objects(page).first().focus();
  await page.locator('.right-sidebar').getByRole('button', { name: 'Дубликат', exact: true }).click();
  await expect(objects(page)).toHaveCount(5);
  await page.locator('.project-menu summary').click();
  await page.getByRole('button', { name: 'Открыть сохранённый проект', exact: true }).click();
  await page.locator('dialog[open] .saved-project').first().click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(objects(page)).toHaveCount(5);
});
test("D03 D04: reopen a saved project and reload this exact project", async ({
  page,
  context,
}) => {
  await ready(page);
  await compose(page);
  await page.getByLabel("Название проекта").fill("Первый проект");
  await page.getByLabel("Название проекта").press("Enter");
  await saved(page);
  await page.locator(".project-menu summary").click();
  await page
    .getByRole("button", { name: "Новая композиция", exact: true })
    .click();
  await expect(objects(page)).toHaveCount(0);
  await saved(page);
  const other = await context.newPage();
  await ready(other);
  await page.locator(".project-menu summary").click();
  await page
    .getByRole("button", { name: "Открыть сохранённый проект", exact: true })
    .click();
  await page
    .locator("dialog[open] .saved-project")
    .filter({ hasText: "Первый проект" })
    .click();
  await expect(page.getByLabel("Название проекта")).toHaveValue(
    "Первый проект",
  );
  await expect(objects(page)).toHaveCount(4);
  await other.getByLabel("Название проекта").fill("Более свежий другой проект");
  await other.getByLabel("Название проекта").press("Enter");
  await saved(other);
  await page.reload();
  await expect(page.getByLabel("Название проекта")).toHaveValue(
    "Первый проект",
  );
  await expect(objects(page)).toHaveCount(4);
});

test("D05 D06: unavailable storage cannot silently close the only scene in memory", async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("Storage disabled", "SecurityError");
    } as typeof indexedDB.open;
  });
  await ready(page);
  await compose(page);
  await page.locator(".project-menu summary").click();
  await page
    .getByRole("button", { name: "Новая композиция", exact: true })
    .click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("Текущий проект остаётся открыт");
  await expect(objects(page)).toHaveCount(4);
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Скачать проект JSON", exact: true })
    .click();
  await download;
  await expect(dialog).toBeVisible();
  await expect(objects(page)).toHaveCount(4);
  await dialog
    .getByRole("button", { name: "Остаться в редакторе", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(objects(page)).toHaveCount(4);
});

test("D07 D08: a conflicting tab saves a separate copy without overwriting the winner", async ({
  page,
  context,
}) => {
  await ready(page);
  await compose(page);
  await saved(page);
  const other = await context.newPage();
  await ready(other);
  await expect(objects(other)).toHaveCount(4);
  await page.getByLabel("Название проекта").fill("Версия A");
  await page.getByLabel("Название проекта").press("Enter");
  await saved(page);
  await other.getByLabel("Название проекта").fill("Версия B");
  await other.getByLabel("Название проекта").press("Enter");
  await expect(other.locator(".storage-banner")).toContainText(
    "другой вкладке",
  );
  await other
    .locator(".storage-banner")
    .getByRole("button", { name: "Сохранить отдельно", exact: true })
    .click();
  await expect(other.getByLabel("Название проекта")).toHaveValue(
    "Версия B — копия",
  );
  await saved(other);
  await page.reload();
  await expect(page.getByLabel("Название проекта")).toHaveValue("Версия A");
  await other.reload();
  await expect(other.getByLabel("Название проекта")).toHaveValue(
    "Версия B — копия",
  );
  await expect(objects(other)).toHaveCount(4);
});

test("D16: denied sessionStorage does not disable working IndexedDB autosave", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Denied", "SecurityError");
    };
  });
  await ready(page);
  await expect(page.locator(".notice")).toContainText(
    "Выбор проекта не запоминается",
  );
  await compose(page);
  await saved(page);
  await expect(page.locator(".storage-banner")).toHaveCount(0);
});

test("D12: a timed-out transition stays cancelled after a real late IndexedDB commit", async ({
  page,
  context,
}) => {
  await ready(page);
  await compose(page);
  await saved(page);
  await context.route("**/idb-hold", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Database barrier</title>",
    }),
  );
  const blocker = await context.newPage();
  await blocker.goto("/idb-hold");
  await blocker.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ochen-composition-studio-v1");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("documents", "readwrite");
          const store = tx.objectStore("documents");
          let released = false,
            ready = false;
          (window as unknown as { releaseHold: () => void }).releaseHold =
            () => {
              released = true;
            };
          const spin = () => {
            const read = store.get("test-barrier-only");
            read.onsuccess = () => {
              if (!ready) {
                ready = true;
                resolve();
              }
              if (!released) spin();
              else db.close();
            };
          };
          spin();
        };
      }),
  );
  try {
    await objects(page).first().focus();
    await page
      .locator(".right-sidebar")
      .getByRole("button", { name: "Дубликат", exact: true })
      .click();
    await page.locator(".project-menu summary").click();
    await page
      .getByRole("button", { name: "Новая композиция", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toContainText(
      "Хранилище отвечает слишком долго",
      { timeout: 8000 },
    );
    await expect(objects(page)).toHaveCount(5);
    await blocker.evaluate(() =>
      (window as unknown as { releaseHold: () => void }).releaseHold(),
    );
    await saved(page);
    // A late successful write may update the status, but cannot resume a cancelled navigation.
    await expect(objects(page)).toHaveCount(5);
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "Повторить сохранение", exact: true })
      .click();
    await expect(objects(page)).toHaveCount(0);
  } finally {
    await blocker.close();
  }
});
