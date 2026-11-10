import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const objects = (p: Page) => p.locator('.interactive-scene [data-instance]');
async function ready(p: Page) { await p.goto('/'); await p.locator('.left-sidebar textarea').waitFor(); }
async function saved(p: Page) { await expect(p.getByText('Сохранено в браузере', { exact: true })).toBeVisible(); }
async function compose(p: Page) { await p.locator('.left-sidebar').getByRole('button', { name: 'Собрать композицию', exact: true }).click(); await expect(objects(p)).toHaveCount(4); await saved(p); }
async function snapshot(p: Page) {
  const download = p.waitForEvent('download');
  const menu = p.locator('dialog[open]');
  if (await menu.count()) await menu.getByRole('button', { name: 'Скачать проект JSON', exact: true }).click();
  else { await p.locator('.project-menu summary').click(); await p.getByRole('button', { name: 'Скачать проект JSON', exact: true }).click(); }
  const data = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  if (!await menu.count()) await p.locator('.project-menu summary').click();
  return data;
}

test('D09 D10: failed conflict copy remains recoverable and opening latest requires an explicit choice', async ({ page, context }) => {
  await ready(page); await compose(page);
  const loser = await context.newPage(); await ready(loser);
  await page.getByLabel('Название проекта').fill('Победитель'); await page.getByLabel('Название проекта').press('Enter'); await saved(page);
  await loser.getByLabel('Название проекта').fill('Своя версия'); await loser.getByLabel('Название проекта').press('Enter');
  await expect(loser.locator('.storage-banner')).toContainText('другой вкладке');
  const before = await snapshot(loser);
  await loser.getByRole('button', { name: 'Открыть актуальную', exact: true }).click();
  await expect(loser.locator('dialog[open]')).toContainText('заменит ваши изменения');
  await expect(loser.getByLabel('Название проекта')).toHaveValue('Своя версия');
  await loser.getByRole('button', { name: 'Остаться в редакторе', exact: true }).click();
  expect(await snapshot(loser)).toEqual(before);
  await loser.evaluate(() => {
    (window as any).originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('Controlled quota failure', 'QuotaExceededError'); };
  });
  await loser.getByRole('button', { name: 'Сохранить отдельно', exact: true }).click();
  await expect(loser.locator('dialog[open]')).toContainText('Controlled quota failure');
  expect(await snapshot(loser)).toEqual(before);
  await expect(loser.getByLabel('Название проекта')).toHaveValue('Своя версия');
  await loser.evaluate(() => { IDBObjectStore.prototype.put = (window as any).originalPut; });
  await loser.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(loser.getByLabel('Название проекта')).toHaveValue('Своя версия — копия');
  await saved(loser);
  const copy = await snapshot(loser);
  expect(copy.id).not.toBe(before.id);
  expect(copy.instances).toEqual(before.instances);
  await page.reload(); await expect(page.getByLabel('Название проекта')).toHaveValue('Победитель');
});

test('D11: repeated New events while flushing produce one destination', async ({ page }) => {
  await ready(page); await compose(page);
  await page.locator('.project-menu summary').click();
  await page.getByRole('button', { name: 'Новая композиция', exact: true }).evaluate(button => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(objects(page)).toHaveCount(0); await saved(page);
  const count = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const r = indexedDB.open('ochen-composition-studio-v1'); r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result; const q = db.transaction('documents').objectStore('documents').count(); q.onsuccess = () => { resolve(q.result); db.close(); }; };
  }));
  expect(count).toBe(2);
});

test('D16: a malformed active ID falls back without deleting saved documents', async ({ page }) => {
  await ready(page); await compose(page);
  const before = await snapshot(page);
  await page.evaluate(() => sessionStorage.setItem('ochen-studio-active-project', '../invalid'));
  await page.reload(); await expect(objects(page)).toHaveCount(4);
  expect(await snapshot(page)).toEqual(before);
});

test('S12: repeated failed asset retries remain explicit and can finally recover', async ({ page }) => {
  let broken = true, requests = 0;
  await page.route('**/catalog/assets/book-L-main.svg', route => {
    requests++;
    return broken ? route.fulfill({ status: 500, body: 'Controlled server failure' }) : route.continue();
  });
  await page.goto('/');
  for (let i = 1; i <= 3; i++) {
    await expect(page.getByRole('heading', { name: 'Библиотека пока недоступна', exact: true })).toBeVisible();
    expect(requests).toBe(i);
    await page.waitForTimeout(150);
    expect(requests).toBe(i); // No automatic retry loop.
    if (i < 3) await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
  }
  broken = false;
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
  await page.locator('.left-sidebar textarea').waitFor();
  expect(requests).toBe(4);
  await compose(page);
});

test('D17: an actual previous-release v1 document restores without migration or geometry changes', async ({ page, context }) => {
  const old = JSON.parse(await readFile('tests/fixtures/project-v1.json','utf8'));
  await context.route('**/seed-v1', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>v1 database fixture</title>'}));
  await page.goto('/seed-v1');
  await page.evaluate(document=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open('ochen-composition-studio-v1',1);
    r.onupgradeneeded=()=>{const store=r.result.createObjectStore('documents',{keyPath:'id'});store.createIndex('updatedAt','updatedAt');};
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({id:document.id,document,storageRevision:1,updatedAt:1});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),old);
  await ready(page); await saved(page);
  expect(await snapshot(page)).toEqual(old);
});

test('U11: the downloaded palette example can be edited and applied without undocumented fields', async ({ page }) => {
  await ready(page); await compose(page);
  const sample=page.waitForEvent('download');
  await page.locator('.right-sidebar').getByRole('button',{name:'Образец JSON',exact:true}).click();
  const palette=JSON.parse(await readFile((await (await sample).path())!,'utf8'));
  palette.name='Проверка образца';palette.colors.accent='#ABC123';
  await page.locator('.right-sidebar input[type=file]').setInputFiles({name:'palette.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(palette))});
  await expect(page.locator('.notice')).toContainText('Палитра применена');
  expect((await snapshot(page)).palette.colors.accent).toBe('#ABC123');
});

test('U12: pointer cancellation and Escape discard a rotation draft', async ({ page }) => {
  await ready(page); await compose(page);
  await objects(page).last().focus();
  const before=await snapshot(page), selected=before.instances.at(-1);
  const slider=page.locator('.right-sidebar').getByLabel('Поворот объекта');
  const draft = async (value: number) => slider.evaluate((input,value)=>{
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,String(value));
    input.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
  await draft(42);
  await expect(page.locator('.right-sidebar .rotation-heading output')).toHaveText('42°');
  await slider.dispatchEvent('pointercancel');
  await page.locator('.workspace-heading').click();
  expect((await snapshot(page)).instances).toEqual(before.instances);
  await expect(slider).toHaveValue(String(selected.rotation));
  await draft(57);
  await slider.press('Escape');
  expect((await snapshot(page)).instances).toEqual(before.instances);
  await expect(slider).toHaveValue(String(selected.rotation));
});

test('U13 U15: fifty overlapping/off-canvas objects remain selectable in layers and can be recovered', async ({page})=>{
  await ready(page);await compose(page);
  const model=await snapshot(page), first=model.instances.find((i:any)=>i.role==='main');
  model.instances=Array.from({length:50},(_,index)=>({...first,id:'layer_'+index,x:index===49?3:.5,y:index===49?3:.5}));
  await page.locator('.studio-header input[type=file]').setInputFiles({name:'layers.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await expect(objects(page)).toHaveCount(50);
  await page.locator('.left-sidebar').getByRole('button',{name:'Слои',exact:true}).click();
  const layers=page.locator('.left-sidebar .layer-select');
  await expect(layers).toHaveCount(50);
  await layers.first().click();
  await expect(layers.first()).toHaveAttribute('aria-pressed','true');
  await page.locator('.right-sidebar').getByRole('button',{name:'В центр холста',exact:true}).click();
  const centered=await snapshot(page);
  expect(centered.instances.at(-1)).toMatchObject({id:'layer_49',x:.5,y:.5,rotation:0});
  await layers.last().click();
  await expect(layers.last()).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.right-sidebar').getByRole('button',{name:'Ниже',exact:true})).toBeDisabled();
});

test('G05 G08: a delayed file read cannot overwrite edits or a newly opened project', async({page})=>{
  await page.addInitScript(()=>{
    const text=File.prototype.text;
    (window as any).reads={};
    File.prototype.text=function(){const file=this;return new Promise<string>((resolve,reject)=>{(window as any).reads[file.name]=()=>text.call(file).then(resolve,reject);});};
  });
  await ready(page);await compose(page);
  const model=await snapshot(page);
  const input=page.locator('.studio-header input[type=file]');
  await input.setInputFiles({name:'A.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...model,name:'Устаревший импорт'}))});
  await objects(page).last().focus();
  await page.locator('.right-sidebar').getByRole('button',{name:'Дубликат',exact:true}).click();
  await page.evaluate(()=>(window as any).reads['A.json']());
  await expect(page.locator('.notice')).toContainText('изменился во время чтения');
  await expect(objects(page)).toHaveCount(5);
  await input.setInputFiles({name:'B.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await page.locator('.project-menu summary').click();
  await page.getByRole('button',{name:'Новая композиция',exact:true}).click();
  await expect(objects(page)).toHaveCount(0);
  const blank=await snapshot(page);
  await page.evaluate(()=>(window as any).reads['B.json']());
  expect(await snapshot(page)).toEqual(blank);
});

test('N05: title length, whitespace and an invalid character keep a recoverable draft', async({page})=>{
  await ready(page);await compose(page);
  const title=page.getByLabel('Название проекта');
  await title.fill('x'.repeat(101));
  await expect(title).toHaveValue('x'.repeat(100));
  await title.press('Enter');await saved(page);
  await title.fill('   ');await title.press('Enter');
  await expect(title).toHaveValue('Новая композиция');
  // Firefox's simulated text insertion strips U+0001. Exercise the app's
  // validator with an exact DOM input value, rather than expecting a warning
  // for a character which never reached the field.
  await title.evaluate(input=>{
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Невалидное\u0001имя');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await expect(title).toHaveValue('Невалидное\u0001имя');
  await title.press('Enter');
  await expect(page.locator('.notice')).toContainText('XML');
  await title.press('Escape');
  await expect(title).toHaveValue('Новая композиция');
  expect((await snapshot(page)).name).toBe('Новая композиция');
});
