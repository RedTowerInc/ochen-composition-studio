import Dexie, { type EntityTable } from "dexie";
import { clone, type SceneDocument } from "./types";

export interface SavedDocument {
  id: string;
  storageRevision: number;
  document: SceneDocument;
  updatedAt: number;
}
export class ConflictError extends Error {
  constructor() {
    super("Проект изменён в другой вкладке. Ваша версия остаётся открытой.");
    this.name = "ConflictError";
  }
}

export class StudioDatabase extends Dexie {
  documents!: EntityTable<SavedDocument, "id">;
  constructor(name = "ochen-composition-studio-v1") {
    super(name);
    this.version(1).stores({ documents: "id, updatedAt" });
    this.on("versionchange", () => this.close());
  }
}

export class ProjectRepository {
  constructor(public db = new StudioDatabase()) {}
  async latest(): Promise<SavedDocument | undefined> {
    return this.db.documents.orderBy("updatedAt").last();
  }
  async get(id: string) {
    return this.db.documents.get(id);
  }
  async save(
    document: SceneDocument,
    expectedRevision: number,
  ): Promise<number> {
    const snapshot = clone(document);
    return this.db.transaction("rw", this.db.documents, async () => {
      const current = await this.db.documents.get(snapshot.id);
      if ((current?.storageRevision ?? 0) !== expectedRevision)
        throw new ConflictError();
      const storageRevision = expectedRevision + 1;
      await this.db.documents.put({
        id: snapshot.id,
        document: snapshot,
        storageRevision,
        updatedAt: Date.now(),
      });
      return storageRevision;
    });
  }
}

export type SaveEvent =
  | {
      status: "saving" | "saved";
      documentRevision: number;
      storageRevision: number;
    }
  | { status: "conflict" | "error"; error: Error };

export class SaveQueue {
  private pending?: SceneDocument;
  private running = false;
  private closed = false;
  private blocked = false;
  constructor(
    private save: (
      document: SceneDocument,
      expected: number,
    ) => Promise<number>,
    private expected: number,
    private notify: (event: SaveEvent) => void,
  ) {}
  submit(document: SceneDocument) {
    if (this.closed || this.blocked) return;
    this.pending = clone(document);
    void this.drain();
  }
  close() {
    this.closed = true;
    this.pending = undefined;
  }
  private async drain() {
    if (this.running || this.closed || this.blocked) return;
    this.running = true;
    try {
      while (this.pending && !this.closed) {
        const snapshot = this.pending;
        this.pending = undefined;
        this.notify({
          status: "saving",
          documentRevision: snapshot.revision,
          storageRevision: this.expected,
        });
        try {
          this.expected = await this.save(snapshot, this.expected);
          if (!this.closed)
            this.notify({
              status: "saved",
              documentRevision: snapshot.revision,
              storageRevision: this.expected,
            });
        } catch (error) {
          this.blocked = true;
          if (!this.closed)
            this.notify({
              status: error instanceof ConflictError ? "conflict" : "error",
              error:
                error instanceof Error
                  ? error
                  : new Error("Сохранение недоступно"),
            });
          break;
        }
      }
    } finally {
      this.running = false;
    }
  }
}
