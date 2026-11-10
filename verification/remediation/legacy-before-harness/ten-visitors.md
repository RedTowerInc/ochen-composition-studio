# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extremes.spec.ts >> ten independent visitors keep separate projects, palettes and histories
- Location: tests\e2e\extremes.spec.ts:36:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.left-sidebar').getByRole('button', { name: 'Собрать композицию', exact: true })
Expected: visible
Timeout: 7000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.left-sidebar').getByRole('button', { name: 'Собрать композицию', exact: true }) with timeout 7000ms
  - waiting for locator('.left-sidebar').getByRole('button', { name: 'Собрать композицию', exact: true })

```

```yaml
- main:
  - link "о. композиция":
    - /url: "#"
  - text: ВЕКТОРНАЯ СТУДИЯ
  - heading "Готовим место для вашей идеи" [level=1]
  - paragraph: Загружаем оригинальные иллюстрации, палитры и варианты детализации.
  - progressbar
  - text: 39 из 40 объектов Из слов — в вектор. Из деталей — в историю.
```

# Test source

```ts
  1   | import { test, expect, type Page } from "@playwright/test";
  2   | import { readFile } from "node:fs/promises";
  3   | 
  4   | const side = (p: Page) => p.locator(".left-sidebar");
  5   | const shapes = (p: Page) => p.locator(".interactive-scene [data-instance]");
  6   | async function ready(p: Page) {
  7   |   await p.goto("/");
  8   |   await expect(
  9   |     side(p).getByRole("button", { name: "Собрать композицию", exact: true }),
> 10  |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  11  | }
  12  | async function generate(p: Page) {
  13  |   await side(p)
  14  |     .getByRole("button", { name: "Собрать композицию", exact: true })
  15  |     .click();
  16  |   await expect(shapes(p)).toHaveCount(4);
  17  | }
  18  | async function downloadProject(p: Page) {
  19  |   await p.locator(".project-menu summary").click();
  20  |   const pending = p.waitForEvent("download");
  21  |   await p
  22  |     .getByRole("button", { name: "Скачать проект JSON", exact: true })
  23  |     .click();
  24  |   const data = JSON.parse(
  25  |     await readFile((await (await pending).path())!, "utf8"),
  26  |   );
  27  |   await p.locator(".project-menu summary").click();
  28  |   return data;
  29  | }
  30  | async function exportSvg(p: Page) {
  31  |   const pending = p.waitForEvent("download");
  32  |   await p.getByRole("button", { name: "Скачать SVG", exact: true }).click();
  33  |   return readFile((await (await pending).path())!, "utf8");
  34  | }
  35  | 
  36  | test("ten independent visitors keep separate projects, palettes and histories", async ({
  37  |   browser,
  38  | }) => {
  39  |   test.setTimeout(60000);
  40  |   const contexts = await Promise.all(
  41  |     Array.from({ length: 10 }, () => browser.newContext()),
  42  |   );
  43  |   try {
  44  |     const documents = await Promise.all(
  45  |       contexts.map(async (context, index) => {
  46  |         const page = await context.newPage();
  47  |         await ready(page);
  48  |         await side(page)
  49  |           .getByRole("button", { name: "По объектам", exact: true })
  50  |           .click();
  51  |         await side(page)
  52  |           .locator("textarea")
  53  |           .fill(index % 2 ? "Книга, Лампа" : "Кошелёк, Монета");
  54  |         await side(page)
  55  |           .getByRole("button", { name: "Собрать композицию", exact: true })
  56  |           .click();
  57  |         await expect(shapes(page)).toHaveCount(3);
  58  |         await page.getByLabel("Название проекта").fill("Посетитель " + index);
  59  |         return downloadProject(page);
  60  |       }),
  61  |     );
  62  |     expect(new Set(documents.map((d) => d.id)).size).toBe(10);
  63  |     for (let i = 0; i < 10; i++) {
  64  |       expect(documents[i].name).toBe("Посетитель " + i);
  65  |       expect(
  66  |         documents[i].instances
  67  |           .filter((x: any) => x.role === "main")
  68  |           .map((x: any) => x.familyId),
  69  |       ).toEqual(i % 2 ? ["book", "lamp"] : ["wallet", "coin"]);
  70  |     }
  71  |   } finally {
  72  |     await Promise.all(contexts.map((c) => c.close()));
  73  |   }
  74  | });
  75  | 
  76  | test("latest palette import wins when the first file finishes last", async ({
  77  |   page,
  78  | }) => {
  79  |   await page.addInitScript(() => {
  80  |     const original = File.prototype.text;
  81  |     (window as any).paletteReads = {};
  82  |     File.prototype.text = function () {
  83  |       const file = this;
  84  |       return new Promise<string>((resolve, reject) => {
  85  |         (window as any).paletteReads[file.name] = () =>
  86  |           original.call(file).then(resolve, reject);
  87  |       });
  88  |     };
  89  |   });
  90  |   await ready(page);
  91  |   await generate(page);
  92  |   const manifest = await (
  93  |     await page.request.get("/catalog/manifest.json")
  94  |   ).json();
  95  |   const palette = (name: string, color: string) => ({
  96  |     name,
  97  |     colors: { ...manifest.palettes[0].colors, background: color },
  98  |   });
  99  |   const input = page.locator(".right-sidebar input[type=file]");
  100 |   await input.setInputFiles({
  101 |     name: "A.json",
  102 |     mimeType: "application/json",
  103 |     buffer: Buffer.from(JSON.stringify(palette("A", "#AABBCC"))),
  104 |   });
  105 |   await input.setInputFiles({
  106 |     name: "B.json",
  107 |     mimeType: "application/json",
  108 |     buffer: Buffer.from(JSON.stringify(palette("B", "#CCDDEE"))),
  109 |   });
  110 |   await page.evaluate(() => (window as any).paletteReads["B.json"]());
```