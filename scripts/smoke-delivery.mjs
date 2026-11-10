import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const origin=process.argv[2]??'http://127.0.0.1:4178';
const output=process.argv[3]??'verification/remediation/clean-zip';
let authorization;
if(process.argv[4]==='--private') {
 console.log('Ready for private Site QA JSON on stdin (input is hidden).');
 if(process.stdin.isTTY) process.stdin.setRawMode(true);
 process.stdin.setEncoding('utf8');process.stdin.resume();
 authorization=await new Promise((resolve,reject)=>{
  let input='';
  const receive=chunk=>{
   input+=chunk;
   if(input.includes('\u0003'))process.exit(1);
   if(/[\r\n]/.test(input)){
    process.stdin.off('data',receive);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
    try{resolve(JSON.parse(input.trim()).authorization);}catch{reject(new Error('Invalid private QA input'));}
   }
  };
  process.stdin.on('data',receive);
 });
 if(typeof authorization!=='string'||!authorization)throw new Error('Missing private Site QA authorization');
}
await mkdir(output,{recursive:true});
const report={origin,started:new Date().toISOString(),errors:[]};
const browser=await chromium.launch({channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 if(authorization)await context.route(origin+'/**',route=>route.continue({headers:{...route.request().headers(),'OAI-Sites-Authorization':'Bearer '+authorization}}));
 const page=await context.newPage();
 const runtime=JSON.parse(await readFile('verification/remediation/runtime-manifest.json','utf8'));
 const entries=Object.entries(runtime);
 report.runtimeFiles=entries.length;report.runtimeDifferences=[];
 for(let start=0;start<entries.length;start+=6)await Promise.all(entries.slice(start,start+6).map(async([file,expected])=>{
  const response=await context.request.get(origin+'/'+file.replace(/^dist\//,''),{headers:authorization?{'OAI-Sites-Authorization':'Bearer '+authorization}:{}});
  if(!response.ok())throw new Error(`Runtime file HTTP ${response.status()}: ${file}`);
  const actual=createHash('sha256').update(await response.body()).digest('hex');
  if(actual!==expected)report.runtimeDifferences.push({file,expected,actual});
 }));
 assert.deepEqual(report.runtimeDifferences,[],'Published/extracted runtime differs from tested build');
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin);
 await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();
 await expect(page.locator('.interactive-scene [data-instance]')).toHaveCount(4);
 await page.locator('.right-sidebar').getByRole('button',{name:'S Меньше деталей',exact:false}).click();
 await page.locator('.right-sidebar').getByRole('button',{name:'Мятная',exact:false}).click();
 const getJSON=async()=>{
  await page.locator('.project-menu summary').click();const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Скачать проект JSON',exact:true}).click();
  const model=JSON.parse(await readFile(await(await pending).path(),'utf8'));
  await page.locator('.project-menu summary').click();return model;
 };
 const model=await getJSON();
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'Скачать SVG',exact:true}).click();
 const svg=await readFile(await(await pending).path(),'utf8');
 report.vector=await page.evaluate(svg=>{
  const document=new DOMParser().parseFromString(svg,'image/svg+xml');
  const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);
  return {valid:!document.querySelector('parsererror,image,script,foreignObject'),paths:document.querySelectorAll('path').length,uniqueIds:new Set(ids).size===ids.length};
 },svg);
 assert.equal(report.vector.valid,true);assert.equal(report.vector.uniqueIds,true);assert.ok(report.vector.paths>0);
 const importedFile={...model,name:'Проверка поставки'};
 await page.locator('.studio-header input[type=file]').setInputFiles({name:'round-trip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(importedFile))});
 await expect(page.getByLabel('Название проекта')).toHaveValue(importedFile.name);
 await expect(page.locator('.interactive-scene [data-instance]')).toHaveCount(4);
 await expect(page.getByText('Сохранено в браузере',{exact:true})).toBeVisible();
 const imported=await getJSON();
 const content=({id,revision,...scene})=>scene;
 assert.notEqual(imported.id,model.id);
 assert.deepEqual(content(imported),content(importedFile));
 await page.reload();await page.locator('.left-sidebar textarea').waitFor();
 assert.deepEqual(await getJSON(),imported);
 await page.screenshot({path:`${output}/studio.png`});
 await writeFile(`${output}/export.svg`,svg);
 await writeFile(`${output}/project.composition.json`,JSON.stringify(imported,null,2));
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{report.finished=new Date().toISOString();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
