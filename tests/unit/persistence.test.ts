import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ProjectRepository,
  SaveQueue,
  StudioDatabase,
  type SaveEvent,
} from "../../src/core/persistence";
import { scene } from "./fixture";
const databases: StudioDatabase[] = [];
afterEach(async () => {
  for (const db of databases) db.close();
  for (const db of databases) await db.delete();
  databases.length = 0;
});
describe("transactional persistence", () => {
  it("flush waits for the requested snapshot after an older in-flight write", async () => {
    const base = scene(),
      writes: number[] = [],
      releases: (() => void)[] = [];
    const queue = new SaveQueue(
      async (document, expected) => {
        writes.push(document.revision);
        await new Promise<void>((resolve) => releases.push(resolve));
        return expected + 1;
      },
      0,
      () => {},
    );
    queue.submit({ ...base, revision: 1 });
    let settled = false;
    const receipt = queue.flush({ ...base, revision: 3 }).then((value) => {
      settled = true;
      return value;
    });
    queue.submit({ ...base, revision: 2 }); // Late debounce cannot replace the requested snapshot.
    releases.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toEqual([1, 3]);
    expect(settled).toBe(false);
    releases.shift()!();
    expect(await receipt).toEqual({
      documentId: base.id,
      documentRevision: 3,
      storageRevision: 2,
    });
    queue.close();
  });
  it("flush of an acknowledged loaded document does not write or conflict unnecessarily", async () => {
    const base = scene();
    let calls = 0;
    const queue = new SaveQueue(
      async () => {
        calls++;
        return 8;
      },
      7,
      () => {},
      { id: base.id, revision: base.revision },
    );
    expect(await queue.flush(base)).toMatchObject({
      storageRevision: 7,
      documentId: base.id,
    });
    expect(calls).toBe(0);
    queue.close();
  });
  it("failed flush rejects and only an explicit retry resumes with the same expected version", async () => {
    const base = scene(),
      expectedVersions: number[] = [];
    let fail = true;
    const queue = new SaveQueue(
      async (_document, expected) => {
        expectedVersions.push(expected);
        if (fail) throw new Error("quota");
        return expected + 1;
      },
      4,
      () => {},
    );
    await expect(queue.flush(base)).rejects.toThrow("quota");
    await expect(queue.flush(base)).rejects.toThrow("quota");
    expect(expectedVersions).toEqual([4]);
    fail = false;
    expect(await queue.flush(base, true)).toMatchObject({ storageRevision: 5 });
    expect(expectedVersions).toEqual([4, 4]);
    queue.close();
  });
  it("closing rejects a flush waiter rather than leaving an unresolved promise", async () => {
    let release!: () => void;
    const queue = new SaveQueue(
      async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return 1;
      },
      0,
      () => {},
    );
    const pending = queue.flush(scene());
    queue.close();
    await expect(pending).rejects.toThrow("закрыта");
    release();
  });
  it("two connections racing from the same version yield one winner and one conflict", async () => {
    const name = "race-" + crypto.randomUUID(),
      a = new StudioDatabase(name),
      b = new StudioDatabase(name);
    databases.push(a, b);
    const ra = new ProjectRepository(a),
      rb = new ProjectRepository(b),
      document = scene();
    await ra.save(document, 0);
    const results = await Promise.allSettled([
      ra.save({ ...document, name: "A" }, 1),
      rb.save({ ...document, name: "B" }, 1),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.any(ConflictError),
    });
    const saved = await ra.get(document.id);
    expect(saved?.storageRevision).toBe(2);
    expect(["A", "B"]).toContain(saved?.document.name);
  });
  it("serializes saves and never reports an old snapshot as a new revision", async () => {
    const events: SaveEvent[] = [],
      writes: number[] = [],
      releases: (() => void)[] = [];
    const queue = new SaveQueue(
      async (document, expected) => {
        writes.push(document.revision);
        await new Promise<void>((r) => releases.push(r));
        return expected + 1;
      },
      0,
      (e) => events.push(e),
    );
    queue.submit({ ...scene(), revision: 1 });
    queue.submit({ ...scene(), revision: 2 });
    queue.submit({ ...scene(), revision: 3 });
    expect(writes).toEqual([1]);
    releases.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([1, 3]);
    expect(
      events
        .filter((e) => e.status === "saved")
        .map((e) => ("documentRevision" in e ? e.documentRevision : 0)),
    ).toEqual([1]);
    releases.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(events.at(-1)).toMatchObject({
      status: "saved",
      documentRevision: 3,
      storageRevision: 2,
    });
    queue.close();
  });
  it("storage failure keeps the supplied document intact and blocks silent retries", async () => {
    const document = scene(),
      snapshot = structuredClone(document),
      events: SaveEvent[] = [];
    let calls = 0;
    const queue = new SaveQueue(
      async () => {
        calls++;
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      0,
      (e) => events.push(e),
    );
    queue.submit(document);
    await new Promise((r) => setTimeout(r, 0));
    queue.submit(document);
    expect(calls).toBe(1);
    expect(events.at(-1)).toMatchObject({ status: "error" });
    expect(document).toEqual(snapshot);
    queue.close();
  });
});
