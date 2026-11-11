import { test,expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const output='verification/re-audit-0.1.1-2026-11-11';
for(const prompt of ['Президент','Не учиться, а отдыхать'])test('M04 UI: '+prompt,async({page},info)=>{
 await page.goto('/');
 await page.locator('.left-sidebar textarea').fill(prompt);
 await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();
 await expect(page.locator('.interactive-scene [data-instance]')).toHaveCount(4);
 const observed=await page.locator('.left-sidebar').innerText();
 await writeFile(`${output}/${info.project.name}-${prompt==='Президент'?'unsupported':'negation'}.txt`,observed);
 await page.screenshot({path:`${output}/${info.project.name}-${prompt==='Президент'?'unsupported':'negation'}.png`});
 // Clarification or a suitable calm-theme selection is acceptable. Confident ideas/study is not.
 if(prompt==='Президент')await expect(page.locator('.notice')).toContainText('Уточните');
 else await expect(page.locator('.left-sidebar')).not.toContainText('Подбор по теме «обучение и знания»');
});
test('S10 UI: inconsistent positive viewBox is refused before ready',async({page},info)=>{
 await page.route('**/catalog/manifest.json',async route=>{
  const response=await route.fetch();const manifest=await response.json();
  manifest.families[0].variants.L.main.viewBox[0]+=10000;
  await route.fulfill({response,json:manifest});
 });
 await page.goto('/');
 // Observe the actual completed load before asserting the required contract.
 await page.locator('.left-sidebar textarea, .boot-card button').first().waitFor();
 const editorReady=await page.locator('.studio-shell').count();
 let boxes;
 if(editorReady){
  await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();
  await expect(page.locator('.interactive-scene [data-instance]')).toHaveCount(4);
  boxes=await page.locator('.interactive-scene [data-instance]').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return{id:n.getAttribute('data-instance'),x:b.x,y:b.y,width:b.width,height:b.height}}));
 }
 await writeFile(`${output}/${info.project.name}-manifest.json`,JSON.stringify({editorReady,boxes},null,2));
 await page.screenshot({path:`${output}/${info.project.name}-manifest.png`});
 await expect(page.locator('.studio-shell')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Повторить загрузку',exact:true})).toBeVisible();
});
test('availability observation: an unfinished asset has no app deadline',async({page},info)=>{
 await page.clock.install({time:new Date('2026-11-10T12:00:00Z')});
 let release!:()=>void; const gate=new Promise<void>(resolve=>{release=resolve});
 let requested!:()=>void;const requestSeen=new Promise<void>(resolve=>{requested=resolve});
 await page.route('**/catalog/assets/book-L-main.svg',async route=>{requested();await gate;await route.continue();});
 await page.goto('/',{waitUntil:'domcontentloaded'});await requestSeen;
 await page.clock.pauseAt(new Date('2026-11-10T13:00:00Z'));
 await page.clock.fastForward(120000);
 const observation={virtualElapsedMs:120000,realRequest:'intentionally unfinished, not HTTP error',bootVisible:await page.locator('.boot-screen').isVisible(),retryButtons:await page.getByRole('button',{name:'Повторить загрузку',exact:true}).count(),progress:await page.locator('progress').getAttribute('value')};
 await writeFile(`${output}/${info.project.name}-pending-asset.json`,JSON.stringify(observation,null,2));
 await page.screenshot({path:`${output}/${info.project.name}-pending-asset.png`});
 expect(observation.bootVisible).toBe(true);expect(observation.retryButtons).toBe(0);
 release();await expect(page.locator('.left-sidebar textarea')).toBeVisible({timeout:15000});
});
