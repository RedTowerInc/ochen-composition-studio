import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const objects=(p:Page)=>p.locator('.interactive-scene [data-instance]');
const button=(p:Page,name:string)=>p.getByRole('button',{name,exact:true});
async function ready(p:Page){await p.goto('/');await p.locator('.left-sidebar textarea').waitFor();}
async function compose(p:Page){await p.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();await expect(objects(p)).toHaveCount(4);await saved(p);}
async function saved(p:Page){await expect(p.getByText('Сохранено в браузере',{exact:true})).toBeVisible();}
async function snapshot(p:Page){
 const download=p.waitForEvent('download');const dialog=p.locator('dialog[open]');
 if(await dialog.count())await dialog.getByRole('button',{name:'Скачать проект JSON',exact:true}).click();
 else{await p.locator('.project-menu summary').click();await button(p,'Скачать проект JSON').click();}
 const data=JSON.parse(await readFile(await(await download).path(),'utf8'));
 if(!await dialog.count())await p.locator('.project-menu summary').click();return data;
}
for(const prompt of ['Президент','Эпидемия','Идеальный шторм','Не учиться, а отдыхать','Отдых без телефона','Учеба и отдых'])
test('RA01 RA02: clarification preserves the whole scene: '+prompt,async({page})=>{
 await ready(page);await compose(page);const before=await snapshot(page);
 await page.locator('.left-sidebar textarea').fill(prompt);
 await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();
 await expect(page.locator('.notice')).toContainText('Уточните');
 expect(await snapshot(page)).toEqual(before);
 await expect(page.locator('.candidate-card:not(:disabled)')).toHaveCount(0);
});
test('RA03 S16: inconsistent metadata fails before ready and retry restores the exact saved project',async({page})=>{
 await ready(page);await compose(page);const before=await snapshot(page);let damaged=true;
 await page.route('**/catalog/manifest.json',async route=>{
  const response=await route.fetch();const manifest=await response.json();if(damaged)manifest.families[0].variants.L.main.viewBox[0]+=10000;
  await route.fulfill({response,json:manifest});
 });
 await page.reload();await expect(page.locator('.boot-card')).toContainText('Габариты');
 await expect(page.locator('.studio-shell')).toHaveCount(0);
 damaged=false;await button(page,'Повторить загрузку').click();await page.locator('.left-sidebar textarea').waitFor();
 expect(await snapshot(page)).toEqual(before);
});
for(const resource of ['manifest.json','assets/book-L-main.svg'])test('RA04: bounded unfinished request and successful retry: '+resource,async({page})=>{
 await page.clock.install({time:new Date('2026-11-11T01:00:00Z')});await page.clock.pauseAt(new Date('2026-11-11T02:00:00Z'));
 let release!:()=>void,seen!:()=>void,block=true;const gate=new Promise<void>(r=>{release=r}),requested=new Promise<void>(r=>{seen=r});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/catalog/'+resource,async route=>{
  if(block){block=false;seen();await gate;try{await route.abort();}catch(error){if(!route.request().failure())throw error;}}
  else await route.continue();
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});await requested;
 if(resource.startsWith('assets'))await expect(page.locator('progress')).toHaveAttribute('value','39');
 await page.clock.fastForward(29999);await expect(button(page,'Повторить загрузку')).toHaveCount(0);
 await page.clock.fastForward(1);await expect(page.locator('.boot-card')).toContainText('слишком долго');
 await button(page,'Повторить загрузку').click();await page.locator('.left-sidebar textarea').waitFor();
 release();await page.clock.fastForward(1000);
 await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();await page.clock.fastForward(100);
 await expect(objects(page)).toHaveCount(4);expect(errors).toEqual([]);
});
test('C09: forced artistic rejection renders one editable native fallback',async({page})=>{
 let injected=0;
 await page.route('**/assets/index-*.js',async route=>{
  const response=await route.fetch(),code=await response.text();
  const gate=/return ([A-Za-z_$][\w$]*)\.visible>=\.1;/g;
  expect([...code.matchAll(gate)]).toHaveLength(1);
  const body=code.replace(gate,(_all,name)=>`return ${name}.visible>=1.1;`);injected++;
  await route.fulfill({response,body,contentType:'text/javascript'});
 });
 await ready(page);await compose(page);expect(injected).toBe(1);
 await expect(page.locator('.candidate-card')).toHaveCount(1);
 await expect(page.locator('.candidate-card')).toContainText('Вписано в холст');
 const model=await snapshot(page);expect(model.instances.filter((i:any)=>i.role==='main')).toHaveLength(3);
 const download=page.waitForEvent('download');await button(page,'Скачать SVG').click();
 const text=await readFile(await(await download).path(),'utf8');
 expect(await page.evaluate(text=>{const doc=new DOMParser().parseFromString(text,'image/svg+xml');return !doc.querySelector('parsererror,image,script')&&doc.querySelectorAll('[data-family]').length===4&&doc.querySelectorAll('path').length>0},text)).toBe(true);
});
