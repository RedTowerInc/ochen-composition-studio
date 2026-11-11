import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';

const out = 'verification/stabilization-0.1.2/soak-mixed-final';
await mkdir(out, { recursive: true });
const report = { started: new Date().toISOString(), cycles: 0, transitions: [], samples: [], errors: [], passed: false };
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  const live = new Set(), create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (...args) => { const url = create(...args); live.add(url); return url; };
  URL.revokeObjectURL = url => { live.delete(url); return revoke(url); };
  window.__soakUrls = live;
});
let page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
const button = name => page.getByRole('button', { name, exact: true });
const shapes = () => page.locator('.interactive-scene [data-instance]');
const sideButton = name => page.locator('.right-sidebar').getByRole('button', { name, exact: false });
const saved = () => expect(page.getByText('Сохранено в браузере', { exact: true })).toBeVisible();
const menu = async name => { await page.locator('.project-menu summary').click(); await button(name).click(); };
async function ready() {
  await page.goto('http://127.0.0.1:4173'); await page.locator('.left-sidebar textarea').waitFor();
}
async function json() {
  const pending = page.waitForEvent('download');
  await menu('Скачать проект JSON');
  const model = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  await page.locator('.project-menu summary').click(); return model;
}
async function svg() {
  const pending = page.waitForEvent('download'); await button('Скачать SVG').click();
  const text = await readFile(await (await pending).path(), 'utf8');
  assert.equal(await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const ids = [...doc.querySelectorAll('[id]')].map(n => n.id);
    return !doc.querySelector('parsererror,image,script,foreignObject') && doc.querySelectorAll('path').length > 0 && ids.length === new Set(ids).size;
  }, text), true); return text;
}
async function transition(cycle) {
  const base = await json(); await saved();
  await menu('Новая композиция'); await expect(shapes()).toHaveCount(0);
  await page.getByLabel('Название проекта').fill('Переход ' + cycle);
  await page.getByLabel('Название проекта').press('Enter');
  await page.locator('.left-sidebar').getByRole('button', { name: 'Собрать композицию', exact: true }).click();
  await expect(shapes()).toHaveCount(4); await saved();
  const auxiliary = await json();
  await menu('Сохранить отдельно');
  await expect(page.getByLabel('Название проекта')).toHaveValue(auxiliary.name + ' — копия');
  await saved(); const copy = await json();
  assert.notEqual(copy.id, auxiliary.id);
  assert.deepEqual(copy.instances, auxiliary.instances);
  assert.deepEqual(copy.palette, auxiliary.palette);
  await menu('Открыть сохранённый проект');
  await page.locator('dialog[open] .saved-project').filter({ hasText: base.name }).click();
  await expect(page.getByLabel('Название проекта')).toHaveValue(base.name);
  const returned = await json(); assert.deepEqual(returned, base);
  report.transitions.push({ cycle, baseId: base.id, newId: auxiliary.id, copyId: copy.id, exactBase: true });
}
async function sample(cdp, started) {
  await page.waitForTimeout(1100); await cdp.send('HeapProfiler.collectGarbage');
  const values = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const ui = await page.evaluate(() => ({ dom: document.querySelectorAll('*').length, activeBlobUrls: window.__soakUrls.size, busy: !!document.querySelector('[aria-busy="true"]') }));
  const data = { elapsedSeconds: (performance.now() - started) / 1000, cycles: report.cycles, heap: values.JSHeapUsedSize, nodes: values.Nodes, listeners: values.JSEventListeners, ...ui };
  report.samples.push(data); assert.equal(ui.activeBlobUrls, 0); assert.equal(ui.busy, false);
}
try {
  await ready();
  await page.getByLabel('Название проекта').fill('Длительный основной');
  await page.getByLabel('Название проекта').press('Enter');
  await page.locator('.left-sidebar').getByRole('button', { name: 'Собрать композицию', exact: true }).click();
  await expect(shapes()).toHaveCount(4); await saved();
  const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  const started = performance.now(), end = started + 1800000;
  let nextSample = 300000;
  while (performance.now() < end) {
    const cycle = ++report.cycles;
    await button('1:1').click(); await sideButton('S Меньше деталей').click(); await sideButton('Мятная').click();
    await shapes().last().focus(); await sideButton('Дубликат').click(); await expect(shapes()).toHaveCount(5);
    await button('Отменить действие').click(); await expect(shapes()).toHaveCount(4);
    await button('Повторить действие').click(); await expect(shapes()).toHaveCount(5);
    await shapes().last().focus(); await button('Удалить объект').click(); await expect(shapes()).toHaveCount(4);
    await sideButton('L Больше деталей').click(); await sideButton('Лиловая').click(); await button('16:9').click();
    if (cycle % 3 === 0) { await svg(); await transition(cycle); }
    await page.locator('.interactive-scene').click({ position: { x: 3, y: 3 } });
    await saved();
    if (performance.now() - started >= nextSample) {
      await sample(cdp, started); nextSample += nextSample < 600000 ? 300000 : 600000;
    }
    report.elapsedSeconds = (performance.now() - started) / 1000;
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ cycle, elapsedSeconds: Math.round(report.elapsedSeconds), transitions: report.transitions.length }));
    await new Promise(resolve => setTimeout(resolve, Math.min(15000, Math.max(0, end - performance.now()))));
  }
  await sample(cdp, started); report.elapsedSeconds = (performance.now() - started) / 1000;
  assert.ok(report.elapsedSeconds >= 1800); assert.ok(report.transitions.length >= 10);
  const first = report.samples[0], last = report.samples.at(-1);
  report.heapInvestigationThreshold = first.heap * 1.25 + 10 * 1024 * 1024;
  assert.ok(last.heap <= report.heapInvestigationThreshold, 'post-GC heap growth requires investigation');
  assert.ok(last.dom <= first.dom + 10, 'DOM growth requires investigation');
  assert.ok(last.listeners <= first.listeners + 10, 'listener growth requires investigation');
  const before = await json(); await saved(); await page.close();
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message)); await ready();
  const after = await json(); assert.deepEqual(after, before);
  await writeFile(`${out}/restored.composition.json`, JSON.stringify(after, null, 2)); await writeFile(`${out}/restored.svg`, await svg());
  await page.screenshot({ path: `${out}/final.png` });
  report.restoredExactly = true; assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally { report.finished = new Date().toISOString(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); await browser.close(); }
