import { expect, test, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await page.locator(".left-sidebar textarea").waitFor();
}
test("N04 N06: rename has an editable empty draft and one undo step", async ({ page }) => {
  await ready(page);
  const title=page.getByLabel("Название проекта");
  const initial=await title.inputValue();
  await title.fill("");
  await expect(title).toHaveValue("");
  await title.pressSequentially("Готовая композиция");
  await expect(page.getByText("Не сохранено",{exact:true})).toBeVisible();
  await title.press("Enter");
  await expect(page.getByText("Сохранено в браузере",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Отменить действие",exact:true}).click();
  await expect(title).toHaveValue(initial);
  await page.getByRole("button",{name:"Повторить действие",exact:true}).click();
  await expect(title).toHaveValue("Готовая композиция");
  await title.fill("Отменённый черновик");
  await title.press("Escape");
  await expect(title).toHaveValue("Готовая композиция");
});
test("N07: title blur and a palette click preserve both commands", async ({ page }) => {
  await ready(page);
  const title=page.getByLabel("Название проекта"), initial=await title.inputValue();
  await title.fill("Новое название");
  await page.locator(".right-sidebar").getByRole("button",{name:"Персиковая",exact:false}).click();
  await expect(title).toHaveValue("Новое название");
  await expect(page.locator(".right-sidebar").getByRole("button",{name:"Персиковая",exact:false})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Отменить действие",exact:true}).click();
  await expect(title).toHaveValue("Новое название");
  await expect(page.locator(".right-sidebar").getByRole("button",{name:"Лиловая",exact:false})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Отменить действие",exact:true}).click();
  await expect(title).toHaveValue(initial);
});
