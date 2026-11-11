import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'verification/stabilization-0.1.2/ui';
await mkdir(out, { recursive: true });
const report = { date: new Date().toISOString(), viewports: [], browserZoom: [], errors: [] };
const browser = await chromium.launch({ channel: 'chrome' });
async function ready(page) {
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  await page.locator('textarea').first().waitFor({ state: 'attached' });
  const generate = page.getByRole('button', { name: 'Собрать композицию', exact: true });
  if (!await generate.isVisible()) await page.getByRole('button', { name: 'Сборка и объекты', exact: true }).click();
  await page.getByRole('button', { name: 'Собрать композицию', exact: true }).click();
  await expect(page.locator('.interactive-scene [data-instance]')).toHaveCount(4);
  await closePanel(page);
}
async function closePanel(page) {
  const close = page.getByRole('button', { name: 'Закрыть панель', exact: true });
  if (await close.isVisible()) await close.click();
}
async function format(page, value) {
  if (!await page.getByRole('button', { name: value, exact: true }).isVisible())
    await page.getByRole('button', { name: 'Параметры', exact: true }).click();
  await page.getByRole('button', { name: value, exact: true }).click();
  await closePanel(page);
}
async function metrics(page) {
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const svg = document.querySelector('.interactive-scene'), rect = svg.getBoundingClientRect();
    const area = document.querySelector('.canvas-area'), box = area.getBoundingClientRect(), css = getComputedStyle(area);
    const w = box.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const h = box.height - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const max = Math.min(w, h * svg.viewBox.baseVal.width / svg.viewBox.baseVal.height, 1100);
    return { innerWidth, innerHeight, dpr: devicePixelRatio, canvasWidth: rect.width, canvasHeight: rect.height,
      fitFraction: rect.width / max, overflow: document.documentElement.scrollWidth > innerWidth,
      cssZoom: document.body.style.zoom, area: [w, h] };
  });
}
async function snapshot(page) {
  await page.locator('.project-menu summary').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать проект JSON', exact: true }).click();
  const result = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  await page.locator('.project-menu summary').click();
  return result;
}
try {
  for (const [width, height, min] of [[1440,900,560],[1366,768,420],[1280,720,360],[390,844,280],[320,740,220],[1024,768,0],[768,1024,0]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await ready(page);
    for (const aspect of (min ? ['16:9'] : ['1:1', '4:5'])) {
      await format(page, aspect);
      const result = { width, height, aspect, ...await metrics(page) };
      report.viewports.push(result);
      assert.equal(result.overflow, false);
      assert.ok(result.canvasWidth >= min - 1, JSON.stringify(result));
      assert.ok(result.fitFraction >= .90, JSON.stringify(result));
      await expect(page.getByRole('button', { name: 'Скачать SVG', exact: true })).toBeVisible();
      await page.screenshot({ path: `${out}/${width}-${height}-${aspect.replace(':','-')}.png` });
    }
    await context.close();
  }
  for (const zoom of [125, 200]) {
    // Real Chrome default page zoom, through Chrome's own Settings UI in a disposable profile.
    // No CSS zoom, DPR emulation or CDP pageScaleFactor is used.
    const context = await chromium.launchPersistentContext('', { channel: 'chrome', viewport: { width: 1440, height: 900 } });
    try {
      const settings = await context.newPage();
      await settings.goto('chrome://settings/appearance');
      await settings.locator('#zoomLevel').selectOption({ label: `${zoom}%` });
      const page = await context.newPage();
      await ready(page);
      await format(page, '16:9');
      const result = { zoom, settingsValue: await settings.locator('#zoomLevel').inputValue(), ...await metrics(page) };
      assert.ok(Math.abs(result.dpr - zoom / 100) < .02, JSON.stringify(result));
      assert.ok(Math.abs(result.innerWidth - 1440 * 100 / zoom) <= 1, JSON.stringify(result));
      assert.equal(result.cssZoom, '');
      assert.equal(result.overflow, false);
      await page.screenshot({ path: `${out}/chrome-zoom-${zoom}.png` });
      const before = await snapshot(page);
      await page.locator('.interactive-scene').scrollIntoViewIfNeeded();
      const start = await page.locator('.interactive-scene').evaluate(svg => {
        const rect = svg.getBoundingClientRect(), area = svg.closest('.canvas-area').getBoundingClientRect();
        for (let y = Math.max(rect.top, area.top, 0) + 12; y < Math.min(rect.bottom, area.bottom, innerHeight) - 30; y += 10)
          for (let x = Math.max(rect.left, area.left, 0) + 12; x < Math.min(rect.right, area.right, innerWidth) - 30; x += 10) {
            const target = document.elementFromPoint(x, y)?.closest('[data-instance]');
            if (target) return { x, y, id: target.getAttribute('data-instance'), width: rect.width, height: rect.height };
          }
        throw new Error('No visible painted object hit');
      });
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 20, start.y + 10);
      await page.mouse.up();
      const after = await snapshot(page);
      const old = before.instances.find(i => i.id === start.id), moved = after.instances.find(i => i.id === old.id);
      assert.ok(Math.abs((moved.x - old.x) - 20 / start.width) < .003, 'zoom drag X');
      assert.ok(Math.abs((moved.y - old.y) - 10 / start.height) < .003, 'zoom drag Y');
      result.dragDelta = [moved.x - old.x, moved.y - old.y];
      const undo = page.getByRole('button', { name: 'Отменить действие', exact: true });
      const useMenu = !await undo.isVisible();
      if (useMenu) await page.locator('.project-menu summary').click();
      await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
      if (useMenu) await page.locator('.project-menu summary').click();
      const undone = await snapshot(page);
      assert.deepEqual(undone.instances, before.instances);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Скачать SVG', exact: true }).click();
      result.svgBytes = (await readFile(await (await download).path())).length;
      report.browserZoom.push(result);
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); await browser.close(); }

