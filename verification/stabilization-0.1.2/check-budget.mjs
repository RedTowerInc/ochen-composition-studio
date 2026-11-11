import { chromium, firefox, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const out='verification/stabilization-0.1.2/budget';await mkdir(out,{recursive:true});
const sourcePath='C:/Users/Andy/Downloads/Новая композиция.svg',actual=await readFile(sourcePath,'utf8');
const catalog=JSON.parse(await readFile('public/catalog/manifest.json','utf8'));
const originals=await Promise.all(catalog.families.flatMap(f=>['L','S'].flatMap(detail=>['main','background'].map(async role=>({family:f.id,detail,role,variant:f.variants[detail][role],text:await readFile('public'+f.variants[detail][role].url,'utf8')})))));
const report={sourcePath,sha256:createHash('sha256').update(actual).digest('hex'),started:new Date().toISOString()};
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://127.0.0.1:4173');
 await page.locator('.left-sidebar textarea').fill('Личный бюджет');
 await page.locator('.left-sidebar').getByRole('button',{name:'Собрать композицию',exact:true}).click();await expect(page.locator('.interactive-scene [data-instance]')).toHaveCount(4);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать SVG',exact:true}).click();
 const fresh=await readFile(await(await pending).path(),'utf8');await writeFile(out+'/fresh.svg',fresh);
 report.analysis=await page.evaluate(({actual,originals})=>{
  const parse=text=>new DOMParser().parseFromString(text,'image/svg+xml'),doc=parse(actual);
  if(doc.querySelector('parsererror,image,script,foreignObject,style'))throw new Error('Invalid/active/non-vector SVG');
  const ids=[...doc.querySelectorAll('[id]')].map(n=>n.id),unique=new Set(ids);if(unique.size!==ids.length)throw new Error('Duplicate SVG IDs');
  for(const n of doc.querySelectorAll('*'))for(const a of n.attributes){
   if(/^on/i.test(a.name))throw new Error('Event attribute');
   if(a.localName==='href'&&(!a.value.startsWith('#')||!unique.has(a.value.slice(1))))throw new Error('External/missing reference');
   for(const match of a.value.matchAll(/url\(\s*['"]?#([^\s)'";]+)['"]?\s*\)/gi))if(!unique.has(match[1]))throw new Error('Missing local resource');
  }
  const paths=root=>[...root.querySelectorAll('path')].map(n=>n.getAttribute('d'));
  const instances=[...doc.querySelectorAll('[data-family]')].map(group=>{
   const family=group.getAttribute('data-family'),role=group.getAttribute('data-role');
   const original=originals.find(o=>o.family===family&&o.role===role&&JSON.stringify(paths(parse(o.text)))===JSON.stringify(paths(group)));
   if(!original)throw new Error('Geometry differs from native source: '+family);
   const match=group.getAttribute('transform').match(/rotate\(([-\d.e+]+)\) scale\(([-\d.e+]+)\)/i);
   if(!match||!Number.isFinite(Number(match[2])))throw new Error('Invalid common transform');
   return{family,role,detail:original.detail,scale:Number(match[2])/original.variant.sourceScale};
  });
  if(instances.some(i=>Math.abs(i.scale-instances[0].scale)>1e-8))throw new Error('Relative proportions changed');
  return{width:doc.documentElement.getAttribute('width'),height:doc.documentElement.getAttribute('height'),paths:doc.querySelectorAll('path').length,images:doc.querySelectorAll('image').length,uniqueIds:true,instances};
 },{actual,originals});
 report.pixels=await page.locator('.interactive-scene').evaluate(async(live,{fresh,actual})=>{
  const view=live.viewBox.baseVal,clone=live.cloneNode(true);clone.setAttribute('width',view.width);clone.setAttribute('height',view.height);
  const sources=[new XMLSerializer().serializeToString(clone),fresh,actual];
  const images=await Promise.all(sources.map(text=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(text)})));
  const width=512,height=Math.round(width*view.height/view.width),pixels=images.map(i=>{const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0,width,height);return ctx.getImageData(0,0,width,height).data});
  const mae=(a,b)=>a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/a.length;
  return{width,height,previewVsFresh:mae(pixels[0],pixels[1]),userVsFresh:mae(pixels[2],pixels[1])};
 },{fresh,actual});
 assert.equal(report.pixels.previewVsFresh,0);
 await page.screenshot({path:out+'/fresh-budget.png'});
 await writeFile(out+'/user-download.svg',actual);
}finally{await browser.close()}
const editorBrowser=await firefox.launch();
try{
 const page=await editorBrowser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:8766/index.html');await page.getByRole('button',{name:'OK',exact:true}).click();
 await page.evaluate(svg=>window.svgEditor.loadFromString(svg,{noAlert:true}),actual);
 await page.locator('#svgcontent path').first().waitFor();assert.equal(await page.locator('#svgcontent path').count(),report.analysis.paths);
 assert.equal(await page.locator('#svgcontent image').count(),0);await page.screenshot({path:out+'/user-svg-editor.png'});
 const target=await page.evaluate(()=>{const canvas=window.svgEditor.svgCanvas,group=document.querySelector('#svgcontent g[id^="object_1_"]'),path=group.querySelector('path');canvas.selectOnly([group]);canvas.ungroupSelectedElement();canvas.ungroupSelectedElement();canvas.selectOnly([path]);canvas.pathActions.toEditMode(path);return{id:path.id,d:path.getAttribute('d')}});
 const x=page.locator('#path_node_x input');await x.fill(String(Number(await x.inputValue())+12));await x.press('Enter');
 assert.notEqual(await page.locator(`[id="${target.id}"]`).getAttribute('d'),target.d);
 const edited=await page.evaluate(()=>window.svgEditor.svgCanvas.svgCanvasToString());await writeFile(out+'/user-node-edited.svg',edited);
 await page.evaluate(svg=>window.svgEditor.loadFromString(svg,{noAlert:true}),edited);assert.equal(await page.locator('#svgcontent path').count(),report.analysis.paths);
 report.editor={editor:'SVG-edit 7.4.2',paths:report.analysis.paths,images:0,nodeEdited:true,reopened:true};
}finally{await editorBrowser.close()}
report.passed=true;report.finished=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
