import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addObject,
  changeObject,
  deleteObject,
  duplicateObject,
  moveLayer,
} from "../../src/core/commands";
import {
  compositionScore,
  makeCandidates,
  resizeScene,
} from "../../src/core/composition";
import { historyReducer, initialHistory } from "../../src/core/history";
import { LatestJob } from "../../src/core/jobs";
import { selectObjects } from "../../src/core/semantics";
import {
  validateScene,
  parsePalette,
  parseJsonFile,
} from "../../src/core/validation";
import { catalog, scene } from "./fixture";

describe("scene invariants and undo", () => {
  it("resizes a manually edited scene without losing or replacing any object", () => {
    let value = addObject(addObject(scene(), "book", catalog), "lamp", catalog);
    value = changeObject(value, value.instances[1].id, {
      role: "background",
      rotation: 41,
      x: 0.19,
    });
    const next = resizeScene(value, 800, 1000);
    expect(next.instances).toEqual(value.instances);
    expect(next.scale / value.scale).toBeCloseTo(416 / 478.8);
    expect(
      resizeScene(resizeScene(next, 1000, 1000), value.width, value.height)
        .scale,
    ).toBeCloseTo(value.scale);
  });
  it("undo restores content, advances revision and allows redo", () => {
    const first = scene(),
      second = addObject(first, "book", catalog);
    let state = historyReducer(initialHistory(first), {
      type: "commit",
      scene: second,
    });
    state = historyReducer(state, { type: "undo" });
    expect(state.present.instances).toEqual([]);
    expect(state.present.revision).toBe(2);
    state = historyReducer(state, { type: "redo" });
    expect(state.present.instances).toEqual(second.instances);
    expect(state.present.revision).toBe(3);
  });
  it("1000 generated command sequences preserve IDs, bounds, serialization and undo", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 100 }),
        (commands) => {
          let state = initialHistory(scene());
          for (const command of commands) {
            const before = state.present,
              last = before.instances.at(-1);
            let next = before;
            if (command === 0 && before.instances.length < 50)
              next = addObject(before, "book", catalog);
            if (command === 1 && last && before.instances.length < 50)
              next = duplicateObject(before, last.id);
            if (command === 2 && last) next = deleteObject(before, last.id);
            if (command === 3 && last)
              next = changeObject(before, last.id, {
                rotation: last.rotation + 17,
                x: last.x + 0.2,
              });
            if (command === 4 && last) next = moveLayer(before, last.id, -1);
            if (command === 5) next = resizeScene(before, 800, 1000);
            if (command < 6) {
              state = historyReducer(state, { type: "commit", scene: next });
              const undone = historyReducer(state, { type: "undo" }).present;
              expect({ ...undone, revision: before.revision }).toEqual(before);
            } else
              state = historyReducer(state, {
                type: command === 6 ? "undo" : "redo",
              });
            expect(
              validateScene(JSON.parse(JSON.stringify(state.present)), catalog),
            ).toEqual(state.present);
            expect(new Set(state.present.instances.map((i) => i.id)).size).toBe(
              state.present.instances.length,
            );
            expect(state.past.length).toBeLessThanOrEqual(60);
            expect(state.future.length).toBeLessThanOrEqual(60);
          }
        },
      ),
      { numRuns: 1000, seed: 20261110 },
    );
  });
  it("refuses a 51st object atomically", () => {
    let value = scene();
    for (let i = 0; i < 50; i++) value = addObject(value, "book", catalog);
    expect(() => addObject(value, "book", catalog)).toThrow("50");
    expect(value.instances).toHaveLength(50);
  });
});
describe("input and composition", () => {
  it("accepts exact object lists including newlines and duplicates", () =>
    expect(
      selectObjects("Книга\nЛампа, книга", "objects", catalog).ids,
    ).toEqual(["book", "lamp", "book"]));
  it("does not substitute unknown objects or meanings", () => {
    expect(() => selectObjects("самолёт", "objects", catalog)).toThrow(
      "Не найдены",
    );
    expect(() => selectObjects("абракадабра", "meaning", catalog)).toThrow(
      "Уточните",
    );
  });
  it("supports all advertised examples", () => {
    for (const prompt of [
      "Сосредоточиться на главном",
      "Время для новых идей",
      "Учиться с удовольствием",
    ])
      expect(
        selectObjects(prompt, "meaning", catalog).ids.length,
      ).toBeGreaterThan(0);
  });
  it("repeats geometry for the same seed and makes distinct layouts", () => {
    const a = makeCandidates(scene(), ["book", "lamp"], catalog),
      b = makeCandidates(scene(), ["book", "lamp"], catalog);
    const geometry = (v: typeof a) =>
      v.map((s) => s.instances.map(({ id, ...i }) => i));
    expect(geometry(a)).toEqual(geometry(b));
    expect(
      new Set(a.map((s) => JSON.stringify(s.instances.map((i) => [i.x, i.y]))))
        .size,
    ).toBe(3);
  });
  it("ranks visibility above a fully off-canvas primary and can omit all background objects", () => {
    const [good] = makeCandidates(scene(), ["book", "lamp"], catalog, false);
    const bad = structuredClone(good);
    bad.instances[0].x = -2;
    expect(compositionScore(good, catalog)).toBeGreaterThan(
      compositionScore(bad, catalog),
    );
    expect(good.instances.every((i) => i.role === "main")).toBe(true);
  });
  it("rejects corrupt documents and palettes before applying anything", () => {
    for (const patch of [
      { width: NaN },
      { width: 99999 },
      { detail: "XL" },
      { schemaVersion: 2 },
      { catalogVersion: "future" },
      { scale: Infinity },
      { instances: [{ id: "x", familyId: "alien" }] },
    ])
      expect(() => validateScene({ ...scene(), ...patch }, catalog)).toThrow();
    expect(() =>
      parsePalette({ name: "Bad", colors: { background: "#fff" } }, catalog),
    ).toThrow();
    expect(() =>
      parsePalette(
        {
          name: "Bad",
          colors: { ...catalog.palettes[0].colors, ink: "#000000" },
        },
        catalog,
      ),
    ).toThrow("Нейтральные");
    expect(() => parseJsonFile("{", 10)).toThrow("JSON");
    expect(() => parseJsonFile(" ".repeat(11), 10)).toThrow("большой");
  });
});
describe("stale asynchronous jobs", () => {
  it("keeps only the newest of 100 overlapping tasks with reversed completions", async () => {
    const jobs = new LatestJob(),
      releases: Array<() => void> = [],
      signals: AbortSignal[] = [];
    const tasks = Array.from({ length: 100 }, (_, index) =>
      jobs.run(
        1,
        () => 1,
        (signal) => {
          signals.push(signal);
          return new Promise<number>((resolve) =>
            releases.push(() => resolve(index)),
          );
        },
      ),
    );
    for (const release of [...releases].reverse()) release();
    expect(
      (await Promise.all(tasks)).filter((value) => value !== undefined),
    ).toEqual([99]);
    expect(signals.filter((signal) => signal.aborted)).toHaveLength(99);
  });
  it("discards A if B finishes before A, even if A ignores abort", async () => {
    const jobs = new LatestJob();
    let release!: (v: string) => void;
    const a = jobs.run(
      1,
      () => 1,
      () => new Promise<string>((r) => (release = r)),
    );
    const b = jobs.run(
      1,
      () => 1,
      async () => "B",
    );
    expect(await b).toBe("B");
    release("A");
    expect(await a).toBeUndefined();
  });
  it("discards a result after an edit or cancellation", async () => {
    const jobs = new LatestJob();
    let revision = 1,
      release!: (v: string) => void;
    const pending = jobs.run(
      1,
      () => revision,
      () => new Promise<string>((r) => (release = r)),
    );
    revision = 2;
    release("old");
    expect(await pending).toBeUndefined();
  });
});
