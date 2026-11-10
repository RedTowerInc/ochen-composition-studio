import { test, expect } from "@playwright/test";
test("an old database connection blocks upgrade without erasing projects", async ({
  page,
  context,
}) => {
  await context.route("**/idb-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>IDB fixture</title>",
    }),
  );
  const blocker = await context.newPage();
  await blocker.goto("/idb-fixture");
  await blocker.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ochen-composition-studio-v1", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("documents", {
            keyPath: "id",
          });
          store.createIndex("updatedAt", "updatedAt");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          (window as any).heldDB = request.result;
          request.result.onversionchange = () => {};
          resolve();
        };
      }),
  );
  await page.goto("/");
  await expect(page.locator(".notice")).toContainText(
    "Закройте старую вкладку",
  );
  await expect(
    page
      .locator(".left-sidebar")
      .getByRole("button", { name: "Собрать композицию", exact: true }),
  ).toBeVisible();
  await blocker.close();
  await page
    .locator(".storage-banner")
    .getByRole("button", { name: "Сохранить отдельно", exact: true })
    .click();
  await expect(
    page.getByText("Сохранено в браузере", { exact: true }),
  ).toBeVisible();
});
