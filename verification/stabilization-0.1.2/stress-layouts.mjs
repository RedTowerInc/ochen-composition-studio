import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 await page.locator('.left-sidebar textarea').waitFor();
 const result=await page.evaluate(async()=>{
  const [{loadCatalog},{makeCandidates},{blankScene},{validateScene}]=await Promise.all([import('/src/core/catalog.ts'),import('/src/core/composition.ts'),import('/src/core/types.ts'),import('/src/core/validation.ts')]);
  const {catalog}=await loadCatalog(new AbortController().signal,()=>{});
  let seed=20261111;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
  const failures=[];let sets=0,candidates=0,fallbacks=0,minInside=1;
  const formats=[[1200,675],[1000,1000],[800,1000],[128,128],[4096,4096],[128,4096],[4096,128]];
  for(let i=0;i<1400;i++){
   const ids=Array.from({length:1+Math.floor(rng()*6)},()=>catalog.families[Math.floor(rng()*catalog.families.length)].id);
   const [width,height]=formats[i%formats.length],detail=i%2?'S':'L',background=i%3===0;
   const scene={...blankScene(catalog),width,height,detail,seed};
   const returned=makeCandidates(scene,ids,catalog,background);sets++;candidates+=returned.length;
   for(const s of returned){
    if(s.fallback)fallbacks++;
    try{validateScene(s,catalog)}catch(e){failures.push({ids,width,height,detail,seed,error:String(e)});continue}
    const actual=s.instances.filter(x=>x.role==='main').map(x=>x.familyId).sort();const expected=(background?ids.slice(0,3):ids).sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))failures.push({reason:'main multiset',ids,actual,expected});
    for(const item of s.instances.filter(x=>x.role==='main')){
     const v=catalog.families.find(f=>f.id===item.familyId).variants[detail].main;
     const angle=item.rotation*Math.PI/180,w=v.viewBox[2]*v.sourceScale*s.scale,h=v.viewBox[3]*v.sourceScale*s.scale;
     const W=Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle)),H=Math.abs(h*Math.cos(angle))+Math.abs(w*Math.sin(angle));
     const l=item.x*width-W/2,t=item.y*height-H/2;
     const fraction=Math.max(0,Math.min(width,l+W)-Math.max(0,l))*Math.max(0,Math.min(height,t+H)-Math.max(0,t))/(W*H);
     minInside=Math.min(minInside,fraction);
     if(fraction<.92-1e-8)failures.push({reason:'outside',ids,width,height,detail,seed,family:item.familyId,fraction});
    }
   }
  }
  return{randomSeed:20261111,sets,candidates,fallbacks,minInside,failures,scope:'independent main bounding boxes, validation and exact main multiset; no alpha analysis of this random corpus'};
 });
 await writeFile('verification/stabilization-0.1.2/stress-layouts.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));if(result.failures.length)process.exitCode=1;
}finally{await browser.close()}

