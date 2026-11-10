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
  async list() {
    return this.db.documents.orderBy("updatedAt").reverse().toArray();
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

const activeKey = "ochen-studio-active-project";
export function activeProjectId(): string | undefined {
  try {
    const id = sessionStorage.getItem(activeKey);
    return id && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
export function rememberProject(id: string): boolean {
  try {
    sessionStorage.setItem(activeKey, id);
    return true;
  } catch {
    return false;
  }
}

export interface SaveReceipt {
  documentId: string;
  documentRevision: number;
  storageRevision: number;
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
  private failure?: Error;
  private latest?: { id: string; revision: number };
  private acknowledged?: SaveReceipt;
  private waiters: {
    id: string;
    revision: number;
    resolve: (receipt: SaveReceipt) => void;
    reject: (error: Error) => void;
  }[] = [];
  constructor(
    private save: (
      document: SceneDocument,
      expected: number,
    ) => Promise<number>,
    private expected: number,
    private notify: (event: SaveEvent) => void,
    initial?: { id: string; revision: number },
  ) {
    if (initial)
      this.acknowledged = {
        documentId: initial.id,
        documentRevision: initial.revision,
        storageRevision: expected,
      };
  }
  submit(document: SceneDocument) {
    if (this.closed || this.blocked) return;
    if (
      this.latest?.id === document.id &&
      this.latest.revision >= document.revision
    )
      return;
    if (
      this.acknowledged?.documentId === document.id &&
      this.acknowledged.documentRevision >= document.revision
    )
      return;
    this.latest = { id: document.id, revision: document.revision };
    this.pending = clone(document);
    void this.drain();
  }
  flush(document: SceneDocument, retry = false): Promise<SaveReceipt> {
    if (this.closed)
      return Promise.reject(new Error("Очередь сохранения закрыта."));
    if (this.blocked && retry && !(this.failure instanceof ConflictError)) {
      this.blocked = false;
      this.failure = undefined;
      this.latest = undefined;
    }
    if (this.blocked)
      return Promise.reject(
        this.failure ?? new Error("Сохранение недоступно."),
      );
    if (
      this.acknowledged?.documentId === document.id &&
      this.acknowledged.documentRevision >= document.revision
    )
      return Promise.resolve({ ...this.acknowledged });
    return new Promise((resolve, reject) => {
      this.waiters.push({
        id: document.id,
        revision: document.revision,
        resolve,
        reject,
      });
      this.submit(document);
    });
  }
  close() {
    this.closed = true;
    this.pending = undefined;
    for (const waiter of this.waiters)
      waiter.reject(new Error("Очередь сохранения закрыта."));
    this.waiters = [];
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
          this.acknowledged = {
            documentId: snapshot.id,
            documentRevision: snapshot.revision,
            storageRevision: this.expected,
          };
          if (!this.closed)
            this.notify({
              status: "saved",
              documentRevision: snapshot.revision,
              storageRevision: this.expected,
            });
          this.waiters = this.waiters.filter((waiter) => {
            if (
              waiter.id === snapshot.id &&
              waiter.revision <= snapshot.revision
            ) {
              waiter.resolve({ ...this.acknowledged! });
              return false;
            }
            return true;
          });
        } catch (error) {
          this.blocked = true;
          this.failure =
            error instanceof Error ? error : new Error("Сохранение недоступно");
          for (const waiter of this.waiters) waiter.reject(this.failure);
          this.waiters = [];
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
