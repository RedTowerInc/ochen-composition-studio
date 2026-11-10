// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadCatalog } from '../../../src/core/catalog';
import { makeCandidates } from '../../../src/core/composition';
import { activeProjectId, rememberProject } from '../../../src/core/persistence';
import { assertAssetColors, exportScene, sanitizeSvg, type AssetStore } from '../../../src/core/svg';
import { blankScene, clone, type Catalog } from '../../../src/core/types';
import { validateScene } from '../../../src/core/validation';

const catalog = JSON.parse(readFileSync('public/catalog/manifest.json', 'utf8')) as Catalog;
const variant = catalog.families[0].variants.L.main;
const svg = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${content}</svg>`;
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe('catalogue refuses damaged sources before ready', () => {
  it('S07 rejects references to a resource removed by purification', () => {
    expect(() => sanitizeSvg(svg('<defs><iframe id="removed"/></defs><path d="M0 0h10" fill="url(#removed)"/>'),variant)).toThrow('отсутствует ресурс');
  });
  it.each(['','<svg','not XML','<svg xmlns="http://www.w3.org/2000/svg"><path'])('S09 rejects empty or truncated XML', source => {
    expect(() => sanitizeSvg(source,variant)).toThrow();
  });
  it.each([
    ['palette', (c: Catalog) => { c.palettes[1].colors.ink = '#000000'; }],
    ['role', (c: Catalog) => { (c.colorRoles as any).accent = 'unknown'; }],
    ['variant', (c: Catalog) => { delete (c.families[0].variants.L as any).main; }],
    ['dimensions', (c: Catalog) => { c.families[0].variants.L.main.viewBox[2] = 0; }],
  ] as const)('S10 rejects corrupt %s before fetching assets', async (_name, damage) => {
    const input = clone(catalog); damage(input);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(input)));
    await expect(loadCatalog(new AbortController().signal, () => {})).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['#00FF00', 'rgb(0,255,0)', 'currentColor'])('S10 rejects foreign paint %s', color => {
    expect(() => assertAssetColors(sanitizeSvg(svg(`<path d="M0 0h10v10z" fill="${color}"/>`), variant), catalog)).toThrow('палитры');
  });
  it('S10 accepts original hex, neutral, none and local gradients', () => {
    const asset = sanitizeSvg(svg(`<defs><linearGradient id="g"><stop stop-color="#D7CDF5"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#g)" stroke="none"/><path d="M0 0h1" fill="white"/>`), variant);
    expect(() => assertAssetColors(asset, catalog)).not.toThrow();
  });
  it.each([404, 500])('S09 rejects asset HTTP %s without returning partial assets', async status => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => String(url).endsWith('manifest.json')
      ? new Response(JSON.stringify(catalog)) : new Response('', { status }));
    await expect(loadCatalog(new AbortController().signal, () => {})).rejects.toThrow('загрузить');
  });
});

describe('bounded composition contracts', () => {
  const assets: AssetStore = new Map(catalog.families.flatMap(f => (['S','L'] as const).flatMap(d => (['main','background'] as const).map(r => {
    const v = f.variants[d][r];
    return [`${f.id}:${d}:${r}`, sanitizeSvg(readFileSync('public' + v.url, 'utf8'), v)] as const;
  }))));
  it.each([[128,128],[4096,4096],[128,4096],[4096,128]])('C13 extreme %s×%s stays finite, serializable and vector', (width,height) => {
    for (const detail of ['S','L'] as const) for (const count of [1,3,6]) {
      const ids = catalog.families.slice(0,count).map(f=>f.id);
      const scene = { ...blankScene(catalog), width, height, detail };
      const candidates = makeCandidates(scene, ids, catalog, false);
      expect(candidates).toHaveLength(3);
      for (const candidate of candidates) {
        expect(validateScene(JSON.parse(JSON.stringify(candidate)), catalog).instances).toHaveLength(count);
        expect(candidate.instances.map(i=>i.familyId).sort()).toEqual([...ids].sort());
        const doc = new DOMParser().parseFromString(exportScene(candidate,catalog,assets),'image/svg+xml');
        expect(doc.querySelector('parsererror,image')).toBeNull();
        expect(doc.querySelector('path')).not.toBeNull();
      }
    }
  }, 20000);
  it('C07 preserves repeated families as separate instances for 1/3/6 objects', () => {
    for (const count of [1,3,6]) for (const scene of makeCandidates(blankScene(catalog), Array(count).fill('coin'), catalog, false)) {
      expect(scene.instances.map(i=>i.familyId)).toEqual(Array(count).fill('coin'));
      expect(new Set(scene.instances.map(i=>i.id)).size).toBe(count);
    }
  });
});

it('D16 ignores malformed active pointers and safely remembers valid IDs', () => {
  for (const value of ['', '../broken', 'a'.repeat(101), '\u0000']) {
    sessionStorage.setItem('ochen-studio-active-project', value);
    expect(activeProjectId()).toBeUndefined();
  }
  expect(rememberProject('valid-project_1')).toBe(true);
  expect(activeProjectId()).toBe('valid-project_1');
});
