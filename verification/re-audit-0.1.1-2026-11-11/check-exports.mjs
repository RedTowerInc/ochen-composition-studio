import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'verification/re-audit-0.1.1-2026-11-11/exports';
await mkdir(out, { recursive: true });
const report = { started: new Date().toISOString(), comparisons: [], errors: [] };
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  const left = page.locator('.left-sidebar'), right = page.locator('.right-sidebar');
  await left.locator('textarea').waitFor();
  await left.getByRole('button', { name: 'По объектам', exact: true }).click();
  const rows = [];
  for (const [index, input, background] of [
    [1, 'Книга, Наушники, Телефон', true],
    [2, 'Монета, Книга, Лампа', true],
    [3, 'Книга, Кошелёк, Лампа, Цветы, Наушники, Пазлы', false],
  ]) {
    await left.locator('textarea').fill(input);
    await left.getByLabel('Добавить фоновый объект').setChecked(background);
    await left.getByRole('button', { name: 'Собрать композицию', exact: true }).click();
    await expect(page.locator('.candidate-card')).toHaveCount(3);
    await page.locator('.candidate-card').first().click();
    for (const detail of ['S','L']) for (const palette of ['Лиловая','Персиковая','Мятная']) for (const format of ['16:9','1:1','4:5']) {
      await right.getByRole('button', { name: detail === 'S' ? 'S Меньше деталей' : 'L Больше деталей', exact: false }).click();
      await right.getByRole('button', { name: palette, exact: false }).click();
      await right.getByRole('button', { name: format, exact: true }).click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Скачать SVG', exact: true }).click();
      const exported = await readFile(await (await download).path(), 'utf8');
      const result = await page.locator('.interactive-scene').evaluate(async (live, exported) => {
        const view = live.viewBox.baseVal, clone = live.cloneNode(true);
        clone.setAttribute('width', view.width); clone.setAttribute('height', view.height);
        const document = new DOMParser().parseFromString(exported, 'image/svg+xml');
        if (document.querySelector('parsererror,image,script,foreignObject')) throw new Error('Invalid or non-vector SVG');
        const ids = [...document.querySelectorAll('[id]')].map(n=>n.id), unique = new Set(ids);
        if (ids.length !== unique.size) throw new Error('Duplicate exported IDs');
        for (const node of document.querySelectorAll('*')) for (const attr of node.attributes) {
          if (attr.localName === 'href' && (!attr.value.startsWith('#') || !unique.has(attr.value.slice(1)))) throw new Error('External/missing href');
          for (const match of attr.value.matchAll(/url\(#([^)]+)\)/g)) if (!unique.has(match[1])) throw new Error('Missing exported resource');
        }
        const images = await Promise.all([new XMLSerializer().serializeToString(clone),exported].map(source => new Promise((resolve,reject)=>{
          const image = new Image(); image.onload=()=>resolve(image); image.onerror=reject;
          image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);
        })));
        const width=512,height=Math.round(width*view.height/view.width);
        const pixels=images.map(image=>{
          const canvas = window.document.createElement('canvas'); canvas.width=width; canvas.height=height;
          const context=canvas.getContext('2d'); context.drawImage(image,0,0,width,height);
          return context.getImageData(0,0,width,height).data;
        });
        let difference=0;
        for(let i=0;i<pixels[0].length;i++) difference+=Math.abs(pixels[0][i]-pixels[1][i]);
        return { width,height,mae:difference/pixels[0].length,paths:document.querySelectorAll('path').length,ids:ids.length };
      }, exported);
      const item = { corpus:index,input,background,detail,palette,format,...result };
      report.comparisons.push(item);
      assert.equal(result.mae,0,JSON.stringify(item));
      if (palette === 'Лиловая') {
        const name=`${index}-${detail}-${format.replace(':','-')}`;
        await writeFile(`${out}/${name}.svg`,exported);
        rows.push({ name, label:`${index} · ${detail} · ${format}`, svg:exported });
      }
    }
  }
  const sheet=await browser.newPage({ viewport:{width:1300,height:1200} });
  await sheet.setContent(`<style>body{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px;background:#f8f6fc;font:14px Arial}figure{margin:0;background:white;padding:12px;text-align:center;border:1px solid #ddd}img{width:100%;height:230px;object-fit:contain}figcaption{padding-top:10px}</style>`+rows.map(row=>`<figure><img src="data:image/svg+xml;base64,${Buffer.from(row.svg).toString('base64')}"><figcaption>${row.label}</figcaption></figure>`).join(''));
  await sheet.screenshot({path:`${out}/contact-sheet.png`,fullPage:true});
  assert.deepEqual(report.errors,[]);
  report.passed=true;
} catch(error) {report.failure=error.stack;process.exitCode=1;}
finally {report.finished=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({comparisons:report.comparisons.length,passed:report.passed,failure:report.failure}));await browser.close();}

