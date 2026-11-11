import { it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { selectObjects } from '../../src/core/semantics';
import { loadCatalog } from '../../src/core/catalog';
import type { Catalog } from '../../src/core/types';

const catalog = JSON.parse(readFileSync('public/catalog/manifest.json','utf8')) as Catalog;
afterEach(()=>vi.restoreAllMocks());

it('control: a genuinely unsupported phrase is rejected',()=>{
  expect(()=>selectObjects('Квантовая запутанность','meaning',catalog)).toThrow(/Уточните/);
});
it('control: the unchanged original catalogue is accepted',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).endsWith('manifest.json')
    ?new Response(JSON.stringify(catalog))
    :new Response(readFileSync('public'+String(url),'utf8')));
  const loaded=await loadCatalog(new AbortController().signal,()=>{});
  expect(loaded.assets.size).toBe(40);
});

it.each(['Президент', 'Эпидемия'])('M04: an unsupported word %s must ask for clarification', prompt => {
  expect(()=>selectObjects(prompt,'meaning',catalog)).toThrow(/Уточните/);
});
it('M04: explicit exclusion of study must not confidently choose study', () => {
  let result;
  try { result=selectObjects('Не учиться, а отдыхать','meaning',catalog); }
  catch(error) { expect(String(error)).toMatch(/Уточните|уточн|неоднознач/); return; }
  expect(result.ids).toContain('flowers');
});
it('S10: positive but inconsistent variant viewBox must be rejected', async () => {
  const damaged=structuredClone(catalog);
  damaged.families[0].variants.L.main.viewBox[0] += 10000;
  vi.spyOn(globalThis,'fetch').mockImplementation(async url => String(url).endsWith('manifest.json')
    ?new Response(JSON.stringify(damaged))
    :new Response(readFileSync('public'+String(url),'utf8')));
  const rejected=await loadCatalog(new AbortController().signal,()=>{}).then(()=>false,()=>true);
  expect(rejected,'inconsistent viewBox must be rejected').toBe(true);
});
