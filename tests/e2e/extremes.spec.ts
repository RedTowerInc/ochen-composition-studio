import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const side = (p: Page) => p.locator(".left-sidebar");
const shapes = (p: Page) => p.locator(".interactive-scene [data-instance]");
async function ready(p: Page) {
  await p.goto("/");
  await expect(
    side(p).getByRole("button", { name: "Собрать композицию", exact: true }),
  ).toBeVisible({ timeout: 20000 });
}
async function generate(p: Page) {
  await side(p)
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await expect(shapes(p)).toHaveCount(4);
}
async function downloadProject(p: Page) {
  await p.locator(".project-menu summary").click();
  const pending = p.waitForEvent("download");
  await p
    .getByRole("button", { name: "Скачать проект JSON", exact: true })
    .click();
  const data = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  await p.locator(".project-menu summary").click();
  return data;
}
async function exportSvg(p: Page) {
  const pending = p.waitForEvent("download");
  await p.getByRole("button", { name: "Скачать SVG", exact: true }).click();
  return readFile((await (await pending).path())!, "utf8");
}

test("ten independent visitors keep separate projects, palettes and histories", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const contexts = await Promise.all(
    Array.from({ length: 10 }, () => browser.newContext()),
  );
  try {
    const documents = await Promise.all(
      contexts.map(async (context, index) => {
        const page = await context.newPage();
        await ready(page);
        await side(page)
          .getByRole("button", { name: "По объектам", exact: true })
          .click();
        await side(page)
          .locator("textarea")
          .fill(index % 2 ? "Книга, Лампа" : "Кошелёк, Монета");
        await side(page)
          .getByRole("button", { name: "Собрать композицию", exact: true })
          .click();
        await expect(shapes(page)).toHaveCount(3);
        await page.getByLabel("Название проекта").fill("Посетитель " + index);
        return downloadProject(page);
      }),
    );
    expect(new Set(documents.map((d) => d.id)).size).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(documents[i].name).toBe("Посетитель " + i);
      expect(
        documents[i].instances
          .filter((x: any) => x.role === "main")
          .map((x: any) => x.familyId).sort(),
      ).toEqual((i % 2 ? ["book", "lamp"] : ["wallet", "coin"]).sort());
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("latest palette import wins when the first file finishes last", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.text;
    (window as any).paletteReads = {};
    File.prototype.text = function () {
      const file = this;
      return new Promise<string>((resolve, reject) => {
        (window as any).paletteReads[file.name] = () =>
          original.call(file).then(resolve, reject);
      });
    };
  });
  await ready(page);
  await generate(page);
  const manifest = await (
    await page.request.get("/catalog/manifest.json")
  ).json();
  const palette = (name: string, color: string) => ({
    name,
    colors: { ...manifest.palettes[0].colors, background: color },
  });
  const input = page.locator(".right-sidebar input[type=file]");
  await input.setInputFiles({
    name: "A.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(palette("A", "#AABBCC"))),
  });
  await input.setInputFiles({
    name: "B.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(palette("B", "#CCDDEE"))),
  });
  await page.evaluate(() => (window as any).paletteReads["B.json"]());
  await expect(page.locator(".notice")).toContainText("применена");
  await page.evaluate(() => (window as any).paletteReads["A.json"]());
  expect((await downloadProject(page)).palette.name).toBe("B");
  expect(await exportSvg(page)).toContain("#CCDDEE");
});

test("fifty original objects export with unique vector IDs and limits stay enforced", async ({
  page,
}) => {
  await ready(page);
  await generate(page);
  const initial = await downloadProject(page);
  const document = {
    ...initial,
    instances: Array.from({ length: 50 }, (_, i) => ({
      ...initial.instances[i % 4],
      id: crypto.randomUUID(),
      x: 0.1 + (i % 8) * 0.11,
      y: 0.15 + Math.floor(i / 8) * 0.11,
    })),
  };
  await page
    .locator(".studio-header input[type=file]")
    .setInputFiles({
      name: "fifty.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
  await expect(shapes(page)).toHaveCount(50);
  await side(page)
    .getByRole("button", { name: "Объекты", exact: true })
    .click();
  await expect(side(page).locator(".object-card").first()).toBeDisabled();
  const text = await exportSvg(page),
    analysis = await page.evaluate((svg) => {
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      const ids = [...doc.querySelectorAll("[id]")].map((n) => n.id);
      return {
        count: doc.querySelectorAll("[data-family]").length,
        total: ids.length,
        unique: new Set(ids).size,
        errors: !!doc.querySelector("parsererror,image,script"),
      };
    }, text);
  expect(analysis.count).toBe(50);
  expect(analysis.unique).toBe(analysis.total);
  expect(analysis.errors).toBe(false);
  const oversized = {
    ...document,
    instances: [
      ...document.instances,
      { ...document.instances[0], id: crypto.randomUUID() },
    ],
  };
  await page
    .locator(".studio-header input[type=file]")
    .setInputFiles({
      name: "fifty-one.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(oversized)),
    });
  await expect(page.locator(".notice")).toContainText("50");
  await expect(shapes(page)).toHaveCount(50);
});

test("pointer cancellation and window blur leave the last committed scene intact", async ({
  page,
}) => {
  await ready(page);
  await generate(page);
  await side(page).getByRole("button", { name: "Слои", exact: true }).click();
  await side(page).locator(".layer-select").first().click();
  const before = await downloadProject(page);
  const selected = shapes(page).filter({
      has: page.locator('rect[vector-effect="non-scaling-stroke"]'),
    }),
    box = await selected.boundingBox();
  for (const event of ["pointercancel", "blur"]) {
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width / 2 - 25,
      box!.y + box!.height / 2 - 20,
    );
    if (event === "pointercancel")
      await page
        .locator(".interactive-scene")
        .dispatchEvent("pointercancel", { pointerId: 1 });
    else await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    const after = await downloadProject(page);
    expect(after.instances).toEqual(before.instances);
    expect(after.revision).toBe(before.revision);
  }
});

test("a failed catalogue request can be retried without a false empty editor", async ({
  page,
}) => {
  await page.route("**/catalog/assets/phone-L-main.svg", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Повторить загрузку", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".studio-shell")).toHaveCount(0);
  await page.unroute("**/catalog/assets/phone-L-main.svg");
  await page
    .getByRole("button", { name: "Повторить загрузку", exact: true })
    .click();
  await generate(page);
});

test("typing spaces and editor hotkeys never corrupt text or object selection", async ({
  page,
}) => {
  await ready(page);
  await generate(page);
  await side(page).getByRole("button", { name: "Слои", exact: true }).click();
  await side(page).locator(".layer-select").first().click();
  await page.getByLabel("Название проекта").fill("Весна");
  await page.getByLabel("Название проекта").press("End");
  await page.getByLabel("Название проекта").pressSequentially(" 2026");
  await expect(page.getByLabel("Название проекта")).toHaveValue("Весна 2026");
  await page.keyboard.press("Backspace");
  await expect(shapes(page)).toHaveCount(4);
  await expect(page.getByLabel("Название проекта")).toHaveValue("Весна 202");
});

test("slow CPU and rapid format changes preserve geometry and live DOM IDs", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await ready(page);
  await generate(page);
  const original = await downloadProject(page);
  for (let i = 0; i < 3; i++)
    for (const format of ["1:1", "4:5", "16:9"])
      await page.getByRole("button", { name: format, exact: true }).click();
  const after = await downloadProject(page);
  expect(after.instances).toEqual(original.instances);
  expect(Number.isFinite(after.scale)).toBe(true);
  const duplicates = await page
    .locator(".studio-shell [id]")
    .evaluateAll((nodes) => {
      const ids = nodes.map((n) => n.id);
      return ids.length - new Set(ids).size;
    });
  expect(duplicates).toBe(0);
  await page
    .getByRole("button", { name: "Увеличить масштаб", exact: true })
    .click();
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(
    page.getByRole("button", { name: "Скачать SVG", exact: true }),
  ).toBeVisible();
  expect(await exportSvg(page)).toContain("<path");
});

test("background objects can be omitted and a cancelled generation cannot replace the scene", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-10T12:00:00Z") });
  await ready(page);
  await side(page).getByLabel("Добавить фоновый объект").uncheck();
  await side(page)
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await expect(shapes(page)).toHaveCount(3);
  const current = await downloadProject(page);
  expect(current.instances.every((i: any) => i.role === "main")).toBe(true);
  await page.clock.pauseAt(new Date("2026-11-10T13:00:00Z"));
  await side(page)
    .getByRole("button", { name: "Собрать композицию", exact: true })
    .click();
  await side(page)
    .getByRole("button", { name: "Отменить сборку", exact: true })
    .click();
  await page.clock.fastForward(1000);
  expect((await downloadProject(page)).instances).toEqual(current.instances);
});
