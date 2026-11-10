import { chromium, firefox } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "verification/strict-audit";
await mkdir(out, { recursive: true });
const report = { date: new Date().toISOString(), checks: [], errors: [] };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ready = async (page) => {
  await page.goto("http://127.0.0.1:5173");
  await page.locator(".left-sidebar textarea").waitFor({ state: "attached" });
};
const records = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("ochen-composition-studio-v1");
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("documents").objectStore("documents").getAll();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
        };
      }),
  );
try {
  // Ordinary UI actions: no mutation of application storage or React state.
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await ready(p);
  await p
    .locator(".left-sidebar button")
    .filter({ hasText: "Собрать композицию" })
    .click();
  await p.locator(".interactive-scene [data-instance]").first().waitFor();
  await p.getByText("Сохранено в браузере", { exact: true }).waitFor();
  const initial = await records(p);
  await p.locator(".interactive-scene [data-instance]").first().focus();
  await p.keyboard.press("Control+d");
  const unsavedObjects = await p
    .locator(".interactive-scene [data-instance]")
    .count();
  await p
    .getByLabel("Название проекта")
    .fill("Последняя правка перед новым проектом");
  await p.evaluate(() => {
    [...document.querySelectorAll(".project-menu button")]
      .find((b) => b.textContent.includes("Новая композиция"))
      .click();
  });
  await p.waitForTimeout(500);
  const after = await records(p);
  report.checks.push({
    id: "new-project",
    unsavedObjects,
    initial: initial.map((r) => ({
      id: r.id,
      name: r.document.name,
      revision: r.document.revision,
      objects: r.document.instances.length,
    })),
    after: after.map((r) => ({
      id: r.id,
      name: r.document.name,
      revision: r.document.revision,
      objects: r.document.instances.length,
    })),
    visibleName: await p.getByLabel("Название проекта").inputValue(),
    menu: await p.locator(".project-menu button").allTextContents(),
  });
  await p.close();

  const q = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await ready(q);
  await q
    .locator(".left-sidebar")
    .getByRole("button", { name: "По объектам", exact: true })
    .click();
  await q.locator(".left-sidebar textarea").fill("Монета, книга, лампа");
  await q
    .locator(".left-sidebar")
    .getByText("Собрать композицию", { exact: true })
    .click();
  await q.locator(".interactive-scene [data-instance]").first().waitFor();
  await q.screenshot({ path: out + "/coin-first.png", fullPage: true });
  const geometry = await q.evaluate(async () => {
    const [
      { blankScene },
      { makeCandidates },
      { selectObjects },
      { exportScene },
      { loadCatalog },
    ] = await Promise.all([
      import("/src/core/types.ts"),
      import("/src/core/composition.ts"),
      import("/src/core/semantics.ts"),
      import("/src/core/svg.ts"),
      import("/src/core/catalog.ts"),
    ]);
    const { catalog, assets } = await loadCatalog(
      new AbortController().signal,
      () => {},
    );
    function bounds(scene, item) {
      const v = catalog.families.find((f) => f.id === item.familyId).variants[
          scene.detail
        ][item.role],
        a = (item.rotation * Math.PI) / 180,
        w = v.viewBox[2] * v.sourceScale * scene.scale,
        h = v.viewBox[3] * v.sourceScale * scene.scale,
        W = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)),
        H = Math.abs(h * Math.cos(a)) + Math.abs(w * Math.sin(a)),
        l = item.x * scene.width - W / 2,
        t = item.y * scene.height - H / 2;
      return {
        family: item.familyId,
        role: item.role,
        visibleBox:
          (Math.max(0, Math.min(l + W, scene.width) - Math.max(l, 0)) *
            Math.max(0, Math.min(t + H, scene.height) - Math.max(t, 0))) /
          (W * H),
        width: W,
        height: H,
      };
    }
    const samples = [];
    let total = 0,
      poor = 0,
      worst = 1;
    for (const [w, h] of [
      [1200, 675],
      [1000, 1000],
      [800, 1000],
    ])
      for (const a of catalog.families)
        for (const b of catalog.families) {
          if (a.id === b.id) continue;
          const scene = { ...blankScene(catalog), width: w, height: h };
          const candidates = makeCandidates(
            scene,
            [a.id, b.id],
            catalog,
            false,
          );
          const fractions = candidates.map((s) =>
            Math.min(...s.instances.map((i) => bounds(s, i).visibleBox)),
          );
          total++;
          const best = Math.max(...fractions);
          if (best < 0.5) {
            poor++;
            if (samples.length < 12)
              samples.push({ first: a.id, second: b.id, w, h, best });
          }
          worst = Math.min(worst, best);
        }
    const scene = { ...blankScene(catalog), seed: 2 };
    const chosen = makeCandidates(
      scene,
      ["coin", "book", "lamp"],
      catalog,
      true,
    );
    const svg = exportScene(chosen[0], catalog, assets);
    const [{ validateScene }] = await Promise.all([
      import("/src/core/validation.ts"),
    ]);
    const controlName = validateScene(
      { ...chosen[0], name: "Проект\u0000из JSON" },
      catalog,
    );
    const controlExport = new DOMParser().parseFromString(
      exportScene(controlName, catalog, assets),
      "image/svg+xml",
    );
    const invalidXmlTitle = {
      acceptedProject: true,
      xmlParserError:
        controlExport.querySelector("parsererror")?.textContent ?? null,
    };
    const semantics = [
      "Идеальная команда",
      "Предел возможностей",
      "Безработица",
      "Нет денег",
      "Светлое будущее",
      "Время для новых идей",
      "книга, телефон, пазлы, наушники, лампа, кошелек, ручка, папка, монета, цветы",
    ].map((prompt) => {
      try {
        return { prompt, result: selectObjects(prompt, "meaning", catalog) };
      } catch (e) {
        return { prompt, error: e.message };
      }
    });
    return {
      pairs: { total, poor, worst, samples },
      coinFirst: chosen.map((s) => ({
        layout: s.layout,
        scale: s.scale,
        objects: s.instances.map((i) => bounds(s, i)),
      })),
      svg,
      semantics,
      invalidXmlTitle,
    };
  });
  await writeFile(out + "/coin-first.svg", geometry.svg);
  delete geometry.svg;
  report.checks.push({ id: "geometry-and-meaning", ...geometry });
  // Previous candidates survive a change of request / background checkbox.
  await q.locator(".left-sidebar textarea").fill("Цветы");
  await q.locator(".left-sidebar input[type=checkbox]").uncheck();
  const candidate = q.locator(".candidate-card").nth(1);
  const beforeFamilies = await q
    .locator(".interactive-scene [data-instance]")
    .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")));
  const candidateEnabled = await candidate.isEnabled();
  await candidate.click();
  report.checks.push({
    id: "stale-request-candidates",
    request: await q.locator(".left-sidebar textarea").inputValue(),
    backgroundChecked: await q
      .locator(".left-sidebar input[type=checkbox]")
      .isChecked(),
    candidateEnabled,
    beforeFamilies,
    afterFamilies: await q
      .locator(".interactive-scene [data-instance]")
      .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label"))),
  });
  // A title edit adds one history step per character, even when it is a single rename.
  await q.getByLabel("Название проекта").fill("");
  report.checks.push({
    id: "clear-name",
    value: await q.getByLabel("Название проекта").inputValue(),
  });
  await q.close();

  const broken = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  broken.on("pageerror", (e) => pageErrors.push(e.message));
  await broken.route("**/catalog/assets/book-L-main.svg", async (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 0L10 10Z" fill="url(#missing)"/></svg>',
    }),
  );
  await ready(broken);
  await broken
    .locator(".left-sidebar")
    .getByText("Собрать композицию", { exact: true })
    .click();
  await broken.waitForTimeout(300);
  report.checks.push({
    id: "broken-local-svg-reference",
    pageErrors,
    body: await broken.locator("body").innerText(),
    rootChildren: await broken.locator("#root > *").count(),
  });
  await broken.screenshot({
    path: out + "/broken-catalog.png",
    fullPage: true,
  });
  await broken.close();

  // Narrow width, keyboard and CSS zoom: product controls, not browser chrome zoom.
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await ready(mobile);
  await mobile.getByRole("button", { name: "Сборка и объекты" }).click();
  await mobile
    .locator("dialog[open]")
    .getByText("Собрать композицию", { exact: true })
    .click();
  await mobile.waitForTimeout(100);
  await mobile.getByRole("button", { name: "Закрыть панель" }).click();
  await mobile.screenshot({ path: out + "/mobile.png", fullPage: true });
  report.checks.push({
    id: "mobile",
    horizontalOverflow: await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    objects: await mobile.locator(".interactive-scene [data-instance]").count(),
  });
  await mobile.close();
  const ff = await firefox.launch();
  try {
    const trials = [];
    for (const paused of [false, true]) {
      const context = await ff.newContext();
      const page = await context.newPage();
      await ready(page);
      await page
        .locator(".left-sidebar")
        .getByText("Собрать композицию", { exact: true })
        .click();
      await page.getByText("Сохранено в браузере", { exact: true }).waitFor();
      await page.clock.install();
      if (paused)
        await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1);
      const before = (await records(page))[0];
      const start = Date.now();
      await page.getByLabel("Название проекта").fill("Ещё не сохранено");
      const afterFill = Date.now() - start;
      let dialogMs = null;
      page.once("dialog", async (d) => {
        dialogMs = Date.now() - start;
        await d.accept();
      });
      await page.close({ runBeforeUnload: true });
      const reopened = await context.newPage();
      await ready(reopened);
      trials.push({
        paused,
        beforeName: before.document.name,
        afterFillMs: afterFill,
        dialogMs,
        restoredName: await reopened
          .getByLabel("Название проекта")
          .inputValue(),
        recordNames: (await records(reopened)).map((r) => r.document.name),
      });
      await context.close();
    }
    report.checks.push({ id: "firefox-close-test-clock", trials });
  } finally {
    await ff.close();
  }
} catch (e) {
  report.errors.push(e.stack);
} finally {
  await browser.close();
  await writeFile(out + "/report.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { checks: report.checks.map((c) => c.id), errors: report.errors },
      null,
      2,
    ),
  );
}
