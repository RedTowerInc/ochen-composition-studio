import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';

const out = 'verification/remediation/soak-30min';
await mkdir(out, { recursive: true });
const report = { started: new Date().toISOString(), cycles: 0, samples: [], errors: [], passed: false };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  const live = new Set();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (...args) => { const url = create(...args); live.add(url); return url; };
  URL.revokeObjectURL = (url) => { live.delete(url); return revoke(url); };
  window.__soakUrls = live;
});
let page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
const shapes = () => page.locator('.interactive-scene [data-instance]');
const button = name => page.getByRole('button', { name, exact: true });
const sideButton = name => page.locator('.right-sidebar').getByRole('button', { name, exact: false });
const ready = async () => { await page.goto('http://127.0.0.1:4173'); await page.locator('.left-sidebar textarea').waitFor(); };
async function download(kind) {
  if (kind === 'json') await page.locator('.project-menu summary').click();
  const pending = page.waitForEvent('download');
  await button(kind === 'json' ? 'Скачать проект JSON' : 'Скачать SVG').click();
  const text = await readFile(await (await pending).path(), 'utf8');
  if (kind === 'json') await page.locator('.project-menu summary').click();
  else {
    const valid = await page.evaluate(text => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      return !doc.querySelector('parsererror,image,script,foreignObject') && doc.documentElement.localName === 'svg';
    }, text);
    assert.equal(valid, true);
  }
  return kind === 'json' ? JSON.parse(text) : text;
}
try {
  await ready();
  await page.locator('.left-sidebar').getByRole('button', { name: 'Собрать композицию', exact: true }).click();
  await expect(shapes()).toHaveCount(4);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const started = performance.now(), end = started + 30 * 60 * 1000;
  let nextSample = 5 * 60 * 1000;
  while (performance.now() < end) {
    const cycle = ++report.cycles;
    await button('1:1').click();
    await sideButton('S Меньше деталей').click();
    await sideButton('Мятная').click();
    await shapes().last().focus();
    await sideButton('Дубликат').click();
    await expect(shapes()).toHaveCount(5);
    await button('Отменить действие').click();
    await expect(shapes()).toHaveCount(4);
    await button('Повторить действие').click();
    await expect(shapes()).toHaveCount(5);
    await shapes().last().focus();
    await page.getByRole('button', { name: 'Удалить объект', exact: true }).click();
    await expect(shapes()).toHaveCount(4);
    await sideButton('L Больше деталей').click();
    await sideButton('Лиловая').click();
    await button('16:9').click();
    if (cycle % 3 === 0) {
      await download('svg');
      const model = await download('json');
      assert.equal(model.instances.length, 4);
      assert.equal(model.detail, 'L');
      assert.equal(new Set(model.instances.map(i => i.id)).size, 4);
    }
    await expect(page.getByText('Сохранено в браузере', { exact: true })).toBeVisible();
    const elapsed = performance.now() - started;
    if (elapsed >= nextSample || elapsed + 18000 >= 30 * 60 * 1000) {
      // Same four-object, L/lilac/16:9 state; GC is an explicit diagnostic, not a RAM measurement.
      await page.waitForTimeout(1100);
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      const values = Object.fromEntries(metrics.map(m => [m.name, m.value]));
      const ui = await page.evaluate(() => ({
        dom: document.querySelectorAll('*').length,
        activeBlobUrls: window.__soakUrls.size,
        busy: !!document.querySelector('[aria-busy="true"]'),
      }));
      report.samples.push({ elapsedSeconds: elapsed / 1000, cycles: cycle, heap: values.JSHeapUsedSize, nodes: values.Nodes, listeners: values.JSEventListeners, ...ui });
      nextSample += (nextSample < 10 * 60 * 1000 ? 5 : 10) * 60 * 1000;
      assert.equal(ui.activeBlobUrls, 0);
      assert.equal(ui.busy, false);
    }
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ cycle, elapsedSeconds: Math.round(elapsed / 1000), samples: report.samples.length }));
    await new Promise(resolve => setTimeout(resolve, Math.min(15000, Math.max(0, end - performance.now()))));
  }
  report.elapsedSeconds = (performance.now() - started) / 1000;
  assert.ok(report.elapsedSeconds >= 1800);
  // Last timed sample can precede 1800 by one cycle: collect an exact final-state sample too.
  await page.waitForTimeout(1100);
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  report.samples.push({ elapsedSeconds: report.elapsedSeconds, heap: metrics.JSHeapUsedSize, nodes: metrics.Nodes, listeners: metrics.JSEventListeners, ...(await page.evaluate(() => ({ dom: document.querySelectorAll('*').length, activeBlobUrls: window.__soakUrls.size }))) });
  const first = report.samples[0], last = report.samples.at(-1);
  report.heapInvestigationThreshold = first.heap * 1.25 + 10 * 1024 * 1024;
  assert.ok(last.heap <= report.heapInvestigationThreshold, 'post-GC heap requires investigation');
  assert.ok(last.dom <= first.dom + 10, 'DOM requires investigation');
  assert.ok(last.listeners <= first.listeners + 10, 'listeners require investigation');
  assert.equal(last.activeBlobUrls, 0);
  const before = await download('json');
  await expect(page.getByText('Сохранено в браузере', { exact: true })).toBeVisible();
  await page.close();
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await ready();
  const after = await download('json');
  assert.deepEqual(after, before);
  await writeFile(`${out}/restored.composition.json`, JSON.stringify(after, null, 2));
  await writeFile(`${out}/restored.svg`, await download('svg'));
  await page.screenshot({ path: `${out}/final.png` });
  assert.deepEqual(report.errors, []);
  report.restoredExactly = true;
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
}
