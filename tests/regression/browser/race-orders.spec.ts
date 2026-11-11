import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const objects=(p:Page)=>p.locator('.interactive-scene [data-instance]');
const button=(p:Page,name:string)=>p.getByRole('button',{name,exact:true});
async function ready(p:Page){await p.goto('/');await p.locator('.left-sidebar textarea').waitFor();}
async function saved(p:Page){await expect(p.getByText('Сохранено в браузере',{exact:true})).toBeVisible({timeout:10000});}
async function compose(p:Page){await p.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();await expect(objects(p)).toHaveCount(4);await saved(p);}
async function snapshot(p:Page){
 const download=p.waitForEvent('download');const dialog=p.locator('dialog[open]');
 if(await dialog.count())await dialog.getByRole('button',{name:'Скачать проект JSON',exact:true}).click();
 else{await p.locator('.project-menu summary').click();await button(p,'Скачать проект JSON').click();}
 const data=JSON.parse(await readFile(await(await download).path(),'utf8'));
 if(!await dialog.count())await p.locator('.project-menu summary').click();return data;
}
async function records(p:Page){return p.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
 const req=indexedDB.open('ochen-composition-studio-v1');req.onerror=()=>reject(req.error);req.onsuccess=()=>{
  const db=req.result,read=db.transaction('documents').objectStore('documents').getAll();read.onerror=()=>{db.close();reject(read.error)};read.onsuccess=()=>{db.close();resolve(read.result)};
 };
}));}
async function hold(context:BrowserContext){
 await context.route('**/copy-barrier',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Copy barrier</title>'}));
 const p=await context.newPage();await p.goto('/copy-barrier');
 await p.evaluate(()=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open('ochen-composition-studio-v1');req.onerror=()=>reject(req.error);req.onsuccess=()=>{
   const db=req.result,tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents');let released=false,ready=false;
   (window as any).releaseCopy=()=>{released=true};
   const spin=()=>{const r=store.get('barrier-only');r.onsuccess=()=>{if(!ready){ready=true;resolve()}if(released)db.close();else spin()}};spin();
  };
 }));return p;
}
for(const winnerIndex of [0,1])for(const late of [false,true])test(`D07 D08: winner ${winnerIndex}, copy acknowledgement ${late?'after timeout':'before timeout'}`,async({page,context})=>{
 test.setTimeout(35000);await ready(page);await compose(page);const other=await context.newPage();await ready(other);
 const pages=[page,other],winner=pages[winnerIndex],loser=pages[1-winnerIndex];
 await winner.bringToFront();await winner.getByLabel('Название проекта').fill('Победитель');await winner.getByLabel('Название проекта').press('Enter');await saved(winner);
 await loser.bringToFront();
 await loser.getByLabel('Название проекта').fill('Своя ветка');await loser.getByLabel('Название проекта').press('Enter');
 await expect(loser.locator('.storage-banner')).toContainText('другой вкладке');const before=await snapshot(loser);
 // Fix the application's deadline before holding a real IDB transaction.
 // Slow test-host commands cannot accidentally change the intended ordering.
 await loser.clock.install({time:new Date('2026-11-11T01:00:00Z')});await loser.clock.pauseAt(new Date('2026-11-11T02:00:00Z'));
 const blocker=await hold(context);
 try{
  await loser.locator('.storage-banner').getByRole('button',{name:'Сохранить отдельно',exact:true}).click();
  await expect(loser.getByLabel('Название проекта')).toHaveValue(before.name);
  await expect(loser.getByLabel('Название проекта')).toBeDisabled();
  if(late){await loser.clock.fastForward(5000);await expect(loser.locator('dialog[open]')).toContainText('слишком долго',{timeout:8000});expect(await snapshot(loser)).toEqual(before);}
  await blocker.evaluate(()=>(window as any).releaseCopy());
  await expect.poll(async()=>(await records(winner)).filter(r=>r.document.name==='Своя ветка — копия').length,{timeout:10000}).toBe(1);
  if(late){await expect(loser.getByLabel('Название проекта')).toHaveValue(before.name);await expect(loser.locator('dialog[open]')).toBeVisible();await button(loser,'Повторить сохранение').click();}
  await expect(loser.getByLabel('Название проекта')).toHaveValue('Своя ветка — копия');await saved(loser);
  const copy=await snapshot(loser);expect(copy.id).not.toBe(before.id);
  expect({...copy,id:before.id,name:before.name,revision:before.revision}).toEqual(before);
  const rows=await records(winner);expect(rows.find(r=>r.id===before.id).document.name).toBe('Победитель');
  expect(rows.filter(r=>r.document.name==='Своя ветка — копия')).toHaveLength(1);
 }finally{await blocker.close();await other.close();}
});
async function freeze(p:Page){await p.clock.install({time:new Date('2026-11-11T01:00:00Z')});await ready(p);await compose(p);await p.clock.pauseAt(new Date('2026-11-11T02:00:00Z'));}
test('G04: format palette detail Undo and Redo invalidate a pending generation',async({page})=>{
 await freeze(page);
 const actions=[()=>button(page,'1:1').click(),()=>page.locator('.right-sidebar').getByRole('button',{name:'Мятная',exact:false}).click(),()=>page.locator('.right-sidebar').getByRole('button',{name:'S Меньше деталей',exact:false}).click(),()=>button(page,'Отменить действие').click(),()=>button(page,'Повторить действие').click()];
 for(const action of actions){
  await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();await action();const changed=await snapshot(page);
  await page.clock.fastForward(1000);expect(await snapshot(page)).toEqual(changed);await expect(page.locator('.candidate-card:not(:disabled)')).toHaveCount(0);
 }
});
test('G05: New while generation waits cannot affect the new editor',async({page})=>{
 await freeze(page);await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();
 await page.locator('.project-menu summary').click();await button(page,'Новая композиция').click();await expect(objects(page)).toHaveCount(0);
 const blank=await snapshot(page);await page.clock.fastForward(1000);expect(await snapshot(page)).toEqual(blank);
});
test('G06: rapid cancellation and same-batch double Apply keep one accepted revision',async({page})=>{
 await freeze(page);const before=await snapshot(page);
 for(let i=0;i<3;i++){await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();await page.locator('.left-sidebar').getByRole('button',{name:'Отменить сборку',exact:true}).click();}
 await page.clock.fastForward(1000);expect(await snapshot(page)).toEqual(before);
 await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();await page.clock.fastForward(100);
 await expect(page.locator('.candidate-card:not(:disabled)')).toHaveCount(3);
 await page.locator('.candidate-card').last().evaluate((b:HTMLButtonElement)=>{b.click();b.click()});
 const after=await snapshot(page);expect(after.revision).toBe(before.revision+1);expect(after.instances).toHaveLength(4);
});
for(const kind of ['palette','project'] as const)for(const order of ['A-first','B-first'])test(`${kind==='palette'?'G07':'G08'}: ${kind} imports complete ${order}`,async({page})=>{
 await page.addInitScript(()=>{const text=File.prototype.text;(window as any).reads={};File.prototype.text=function(){const f=this;return new Promise<string>((resolve,reject)=>{(window as any).reads[f.name]=()=>text.call(f).then(resolve,reject)});};});
 await ready(page);await compose(page);const model=await snapshot(page);
 const values=kind==='palette'?[{name:'A',colors:{...model.palette.colors,background:'#AABBCC'}},{name:'B',colors:{...model.palette.colors,background:'#CCDDEE'}}]:[{...model,name:'Импорт A'},{...model,name:'Импорт B'}];
 const input=page.locator(kind==='palette'?'.right-sidebar input[type=file]':'.studio-header input[type=file]');
 for(let i=0;i<2;i++)await input.setInputFiles({name:(i?'B':'A')+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(values[i]))});
 for(const name of order==='A-first'?['A.json','B.json']:['B.json','A.json'])await page.evaluate(name=>(window as any).reads[name](),name);
 if(kind==='palette')await expect(page.locator('.notice')).toContainText('применена');else await expect(page.getByLabel('Название проекта')).toHaveValue('Импорт B');
 const current=await snapshot(page);if(kind==='palette')expect(current.palette.name).toBe('B');else{expect(current.name).toBe('Импорт B');expect(current.id).not.toBe(model.id);expect(current.instances).toEqual(model.instances);}
});
