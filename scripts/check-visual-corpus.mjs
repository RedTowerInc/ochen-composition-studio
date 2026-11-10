import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='verification/remediation/visual-corpus';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:5173');
  await page.locator('.left-sidebar textarea').waitFor();
  const rows=await page.evaluate(async()=>{
    const [{loadCatalog},{blankScene},{makeCandidates},{exportScene}]=await Promise.all([
      import('/src/core/catalog.ts'),import('/src/core/types.ts'),import('/src/core/composition.ts'),import('/src/core/svg.ts')
    ]);
    const {catalog,assets}=await loadCatalog(new AbortController().signal,()=>{}),rows=[];
    const add=(ids,detail,width,height,background,label)=>{
      const scene=makeCandidates({...blankScene(catalog),seed:20261110,detail,width,height},ids,catalog,background)[0];
      rows.push({label,scene,svg:exportScene(scene,catalog,assets)});
    };
    for(const family of catalog.families) for(const detail of ['S','L'])
      add([family.id],detail,1200,675,false,`${family.name} · ${detail}`);
    const corpus=[['coin','book','lamp'],['book','wallet','phone'],['flowers','lamp','headphones'],['pen','folder','puzzle'],['book','phone','puzzle','headphones','lamp','wallet'],['coin','coin','coin']];
    for(const ids of corpus) for(const detail of ['S','L']) for(const [width,height] of [[1200,675],[1000,1000],[800,1000]])
      add(ids,detail,width,height,ids.length<6,`${ids.join(', ')} · ${detail} · ${width}:${height}`);
    return rows;
  });
  const sheet=await browser.newPage({viewport:{width:1500,height:1200}});
  for(let i=0;i<rows.length;i+=28){
    await sheet.setContent(`<style>body{margin:16px;background:#f8f6fc;font:12px Arial;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;background:white;border:1px solid #ddd;padding:8px;text-align:center}img{width:100%;height:170px;object-fit:contain}figcaption{padding:8px 0}</style>`+rows.slice(i,i+28).map(row=>`<figure><img src="data:image/svg+xml;base64,${Buffer.from(row.svg).toString('base64')}"><figcaption>${row.label}</figcaption></figure>`).join(''));
    await sheet.screenshot({path:`${out}/sheet-${i/28+1}.png`,fullPage:true});
  }
  await writeFile(`${out}/scenes.json`,JSON.stringify(rows.map(({svg,...row})=>row),null,2));
  console.log(JSON.stringify({scenes:rows.length,seed:20261110,sheets:Math.ceil(rows.length/28)}));
}finally{await browser.close();}
