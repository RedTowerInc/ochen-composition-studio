import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const run = process.env.OCHEN_AUDIT_RUN ?? "A01-quality";
if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error("Invalid audit run name");
const output = `verification/remediation/${run}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:5173");
  await page.locator(".left-sidebar textarea").waitFor();
  const result = await page.evaluate(async () => {
    const [{ loadCatalog }, { blankScene }, { makeCandidates }, { exportScene }] = await Promise.all([
      import("/src/core/catalog.ts"), import("/src/core/types.ts"), import("/src/core/composition.ts"), import("/src/core/svg.ts"),
    ]);
    const { catalog, assets } = await loadCatalog(new AbortController().signal, () => {});
    const formats = [[1200, 675], [1000, 1000], [800, 1000]];
    const pairFailures = [], times = [];
    let pairSets = 0, candidateCount = 0;
    function fraction(scene, item) {
      const v = catalog.families.find((f) => f.id === item.familyId).variants[scene.detail][item.role];
      const angle = item.rotation * Math.PI / 180;
      const w = v.viewBox[2] * v.sourceScale * scene.scale, h = v.viewBox[3] * v.sourceScale * scene.scale;
      const W = Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle)), H = Math.abs(h*Math.cos(angle))+Math.abs(w*Math.sin(angle));
      const l = item.x*scene.width-W/2, t = item.y*scene.height-H/2;
      return Math.max(0,Math.min(scene.width,l+W)-Math.max(0,l))*Math.max(0,Math.min(scene.height,t+H)-Math.max(0,t))/(W*H);
    }
    for (const a of catalog.families) for (const b of catalog.families) {
      if (a.id===b.id) continue;
      for (const [width,height] of formats) for (const detail of ["L","S"]) for (const background of [false,true]) for (const seed of [0,20261110,4294967295]) {
        const start = performance.now();
        const candidates = makeCandidates({ ...blankScene(catalog), width, height, detail, seed },[a.id,b.id],catalog,background);
        times.push(performance.now()-start); pairSets++; candidateCount += candidates.length;
        for (const s of candidates) for (const item of s.instances) {
          if (item.role === "main" && fraction(s,item)<.5) pairFailures.push({ ids:[a.id,b.id], width,height,detail,background,seed,layout:s.layout,family:item.familyId,fraction:fraction(s,item) });
        }
      }
    }
    const corpus = [["coin","book","lamp"],["pen","book","flowers"],["puzzle","folder","headphones"],["wallet","phone","flowers"],["book","coin","pen","folder","flowers","headphones"],["coin","coin","book"]];
    const failures=[], measured=[];
    const parser=new DOMParser(), serializer=new XMLSerializer();
    async function alpha(svg,w,h) {
      const image=new Image();
      const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
      try {
        image.src=url; await image.decode();
        const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
        const rgba=ctx.getImageData(0,0,w,h).data, mask=new Uint8Array(w*h);
        let sum=0;for(let i=0;i<mask.length;i++){mask[i]=rgba[i*4+3];sum+=mask[i]/255;}
        canvas.width=1;canvas.height=1;
        return {mask,sum};
      } finally { URL.revokeObjectURL(url); }
    }
    let scenes=0, instances=0;
    for (const ids of corpus) for(const [width,height] of formats) for(const detail of ["L","S"]) for(const background of [false,true]) {
      const candidates=makeCandidates({...blankScene(catalog),width,height,detail,seed:20261110},ids,catalog,background);
      for(const scene of candidates) {
        const density=1024/Math.max(width,height), W=Math.round(width*density),H=Math.round(height*density);
        const masks=[];
        for(const item of scene.instances){
          const text=exportScene({...scene,instances:[item]},catalog,assets);
          const doc=parser.parseFromString(text,"image/svg+xml"),root=doc.documentElement;
          root.querySelector(":scope > rect").remove();
          const onCanvas=await alpha(serializer.serializeToString(root),W,H);
          root.style.position="fixed";root.style.left="-100000px";
          document.body.append(document.importNode(root,true));
          const mounted=document.body.lastElementChild, box=mounted.getBBox();mounted.remove();
          const pad=2/density;
          root.setAttribute("viewBox",`${box.x-pad} ${box.y-pad} ${box.width+2*pad} ${box.height+2*pad}`);
          const fw=Math.ceil((box.width+2*pad)*density),fh=Math.ceil((box.height+2*pad)*density);
          root.setAttribute("width",String(fw));root.setAttribute("height",String(fh));root.removeAttribute("style");
          const full=await alpha(serializer.serializeToString(root),fw,fh);
          masks.push({...onCanvas,full:full.sum,item});instances++;
        }
        let primary=true;
        for(let i=0;i<masks.length;i++){
          const current=masks[i];
          if(current.full<=0){failures.push({ids,width,height,detail,background,layout:scene.layout,family:current.item.familyId,reason:"empty mask"});continue;}
          const clipped=current.sum/current.full;
          let surviving=0;
          for(let p=0;p<current.mask.length;p++){
            let contribution=current.mask[p]/255;
            if(!contribution)continue;
            for(let j=i+1;j<masks.length;j++){contribution*=1-masks[j].mask[p]/255;if(!contribution)break;}
            surviving+=contribution;
          }
          const visible=surviving/current.full,isPrimary=current.item.role==="main"&&primary;
          if(current.item.role==="main")primary=false;
          const minClipped=current.item.role==="background"?.1:isPrimary?.8:.6;
          const minVisible=isPrimary?.55:.35;
          const entry={ids,width,height,detail,background,layout:scene.layout,family:current.item.familyId,role:current.item.role,primary:isPrimary,clipped,visible};
          measured.push(entry);
          if(clipped<minClipped||(current.item.role==="main"&&visible<minVisible)){
            failures.push({...entry,...(failures.length<5?{svg:exportScene(scene,catalog,assets)}:{})});
          }
        }
        scenes++;
      }
    }
    times.sort((a,b)=>a-b);
    return {samplingLongSide:1024,pairSets,candidateCount,pairFailures,renderedScenes:scenes,renderedInstances:instances,failures,measured,geometryP95Ms:times[Math.ceil(times.length*.95)-1],geometryMaxMs:Math.max(...times)};
  });
  for(let i=0;i<result.failures.length;i++){
    const failure=result.failures[i];
    if(failure.svg){await writeFile(`${output}/failure-${i}.svg`,failure.svg);delete failure.svg;}
  }
  await writeFile(`${output}/report.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({pairSets:result.pairSets,candidateCount:result.candidateCount,pairFailures:result.pairFailures.length,renderedScenes:result.renderedScenes,renderedInstances:result.renderedInstances,paintFailures:result.failures.length,p95:result.geometryP95Ms,max:result.geometryMaxMs,examples:result.failures.slice(0,4)}));
  await page.close();
  const ui=await browser.newPage({viewport:{width:1440,height:1000}});
  await ui.goto("http://127.0.0.1:5173");
  await ui.locator(".left-sidebar textarea").waitFor();
  await ui.locator(".left-sidebar").getByRole("button",{name:"По объектам",exact:true}).click();
  await ui.locator(".left-sidebar textarea").fill("Монета, книга, лампа");
  await ui.locator(".left-sidebar").getByRole("button",{name:"Собрать композицию",exact:true}).click();
  await ui.locator(".interactive-scene [data-instance]").first().waitFor();
  await ui.screenshot({path:`${output}/coin-first-after.png`,fullPage:true});
  if(result.pairFailures.length||result.failures.length)process.exitCode=1;
} finally {await browser.close();}
