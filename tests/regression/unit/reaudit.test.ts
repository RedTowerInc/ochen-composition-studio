import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CATALOG_TIMEOUT_MS, loadCatalog } from "../../../src/core/catalog";
import { selectObjects } from "../../../src/core/semantics";
import { makeCandidates } from "../../../src/core/composition";
import * as geometry from "../../../src/core/geometry";
import { blankScene, type Catalog } from "../../../src/core/types";
import { validateScene } from "../../../src/core/validation";
import { SaveQueue } from "../../../src/core/persistence";
import { LatestJob } from "../../../src/core/jobs";

const catalog = JSON.parse(readFileSync("public/catalog/manifest.json", "utf8")) as Catalog;
const originalFetch = (input = catalog, rewrite = (text: string) => text) => vi.spyOn(globalThis, "fetch").mockImplementation(async url =>
  new Response(String(url).endsWith("manifest.json") ? JSON.stringify(input) : rewrite(readFileSync("public" + String(url), "utf8"))));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(["Президент", "Эпидемия", "Видеокассета", "Идеальный шторм", "Домино", "Планета", "Организм", "Телефонист"])("RA01: unknown whole-word meaning asks to clarify: %s", prompt => {
  expect(() => selectObjects(prompt, "meaning", catalog)).toThrow(/Уточните/);
});
it.each(["Не учиться, а отдыхать", "Не учеба, а отдых", "Отдых без телефона", "Ни книга, ни телефон", "Учеба и отдых", "Работа или отдых"])("RA02: negation/ambiguity never confidently selects an excluded theme: %s", prompt => {
  expect(() => selectObjects(prompt, "meaning", catalog)).toThrow(/Уточните/);
});
it.each([
  ["Нет денег", "wallet"], ["Личный бюджет", "coin"], ["Сбережения", "wallet"],
  ["УЧЁБА", "book"], ["Учусь с удовольствием", "book"], ["Время для новых идей", "puzzle"],
  ["Сосредоточиться на главном", "headphones"], ["Домашний уют", "flowers"],
  ["Цифровое общение", "phone"], ["Дедлайны", "folder"], ["Рабочие задачи", "folder"],
])("M02: positive word forms still work: %s", (prompt, id) => {
  expect(selectObjects(prompt, "meaning", catalog).ids).toContain(id);
});
it("RA03 control: every original native SVG matches its metadata", async () => {
  originalFetch();
  const loaded = await loadCatalog(new AbortController().signal, () => {});
  expect(loaded.assets.size).toBe(40);
});
it.each([0, 1, 2, 3])("RA03: positive inconsistent viewBox component %s is rejected", async index => {
  const damaged = structuredClone(catalog);
  damaged.families[0].variants.L.main.viewBox[index] += 10000;
  originalFetch(damaged);
  await expect(loadCatalog(new AbortController().signal, () => {})).rejects.toThrow("Габариты");
});
it("RA03: missing root viewBox is rejected before ready", async () => {
  originalFetch(catalog, text => text.replace(/viewBox="[^"]*"/, ""));
  await expect(loadCatalog(new AbortController().signal, () => {})).rejects.toThrow("Габариты");
});
it("RA04: deadline settles even when a transport ignores abort; no progress or timers leak", async () => {
  vi.useFakeTimers();
  let observedSignal: AbortSignal | undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
    observedSignal = init?.signal as AbortSignal;
    return new Promise(() => {});
  });
  const progress = vi.fn();
  const promise = loadCatalog(new AbortController().signal, progress);
  const assertion = expect(promise).rejects.toThrow("слишком долго");
  await vi.advanceTimersByTimeAsync(CATALOG_TIMEOUT_MS);
  await assertion;
  expect(observedSignal?.aborted).toBe(true);
  expect(progress).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("RA04: external cancellation settles immediately and clears its deadline", async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const promise = loadCatalog(controller.signal, () => {});
  const assertion = expect(promise).rejects.toThrow("cancelled by test");
  controller.abort(new Error("cancelled by test"));
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
it("C09: forced rejection of artistic candidates executes one real finite fallback", () => {
  // Fault injection targets only the artistic acceptance gate. Fallback geometry
  // and source metadata remain real, and assertions use separate calculations.
  const gate = vi.spyOn(geometry, "unionArea").mockReturnValue(Infinity);
  for (const [width, height] of [[1200, 675], [1000, 1000], [800, 1000]])
    for (const detail of ["S", "L"] as const) for (const background of [false, true]) {
      const ids = ["coin", "book", "lamp", "flowers", "phone", "headphones"];
      const [fallback, ...others] = makeCandidates({ ...blankScene(catalog), width, height, detail }, ids, catalog, background);
      expect(others).toHaveLength(0); expect(fallback.fallback).toBe(true);
      expect(validateScene(fallback, catalog).instances).toHaveLength(6);
      expect(fallback.instances.map(i => i.familyId).sort()).toEqual([...ids].sort());
      const mains = fallback.instances.filter(i => i.role === "main");
      expect(mains).toHaveLength(background ? 3 : 6);
      for (const item of mains) {
        const v = catalog.families.find(f => f.id === item.familyId)!.variants[detail].main;
        const angle = item.rotation * Math.PI / 180;
        const w = v.viewBox[2] * v.sourceScale * fallback.scale, h = v.viewBox[3] * v.sourceScale * fallback.scale;
        const W = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle));
        const H = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle));
        expect(item.x * width - W / 2).toBeGreaterThanOrEqual(-1e-7);
        expect(item.y * height - H / 2).toBeGreaterThanOrEqual(-1e-7);
        expect(item.x * width + W / 2).toBeLessThanOrEqual(width + 1e-7);
        expect(item.y * height + H / 2).toBeLessThanOrEqual(height + 1e-7);
      }
    }
  expect(gate).toHaveBeenCalled();
});
it("D02: ten controlled older-first acknowledgements never satisfy a newer flush", async () => {
  for (let run = 0; run < 10; run++) {
    const releases: (() => void)[] = [], writes: number[] = [];
    const queue = new SaveQueue(async (scene, expected) => {
      writes.push(scene.revision); await new Promise<void>(r => releases.push(r)); return expected + 1;
    }, 0, () => {});
    const scene = blankScene(catalog); queue.submit({ ...scene, revision: 1 });
    let acknowledged = false;
    const receipt = queue.flush({ ...scene, revision: 3 }).then(r => { acknowledged = true; return r; });
    queue.submit({ ...scene, revision: 2 }); releases.shift()!();
    await vi.waitFor(() => expect(writes).toEqual([1, 3])); expect(acknowledged).toBe(false);
    releases.shift()!(); expect(await receipt).toMatchObject({ documentRevision: 3, storageRevision: 2 }); queue.close();
  }
});
it.each(["A-first", "B-first"])("G03: ten controlled generation completion orders %s keep only B", async order => {
  for (let run = 0; run < 10; run++) {
    const job = new LatestJob(); let a!: () => void, b!: () => void;
    const first = job.run(1, () => 1, () => new Promise<string>(r => { a = () => r("A"); }));
    const second = job.run(1, () => 1, () => new Promise<string>(r => { b = () => r("B"); }));
    for (const finish of order === "A-first" ? [a, b] : [b, a]) finish();
    expect(await first).toBeUndefined(); expect(await second).toBe("B");
  }
});
