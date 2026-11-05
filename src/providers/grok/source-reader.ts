const DATABASE_NAME = "GrokToolboxDB";
const CONVERSATIONS_STORE = "conversations";
const UPDATE_TIME_INDEX = "updateTimeIndex";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 250;

type KeyPath = string | string[] | null;

export interface SourceCursor {
  indexKey: IDBValidKey;
  primaryKey: IDBValidKey;
}

export interface SourceRecord<T = unknown> {
  primaryKey: IDBValidKey;
  indexKey: IDBValidKey;
  value: T;
}

export interface SourceBatch<T = unknown> {
  records: SourceRecord<T>[];
  nextCursor: SourceCursor | null;
  done: boolean;
}

export interface GrokSourceSchema {
  databaseName: string;
  databaseVersion: number;
  stores: Record<
    string,
    { keyPath: KeyPath; indexes: Record<string, KeyPath> }
  >;
}

/** Read-only adapter for Grok's origin IndexedDB. */
export class GrokSourceReader {
  private database: IDBDatabase | null = null;
  private schema: GrokSourceSchema | null = null;
  private opening: Promise<GrokSourceSchema> | null = null;

  async open(): Promise<GrokSourceSchema> {
    if (this.database && this.schema) return this.schema;

    this.opening ??= this.openAndValidate().finally(() => {
      this.opening = null;
    });

    return this.opening;
  }

  /** Read full conversation records ordered by update_time. */
  async readConversationBatch(
    options: {
      after?: SourceCursor | null;
      limit?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<SourceBatch> {
    const limit = normalizeBatchSize(options.limit);
    const after = options.after ?? null;
    const records: SourceRecord[] = [];
    let nextCursor = after;
    let hasMore = false;

    return this.readOnly(options.signal, (store) => {
      const range = after ? IDBKeyRange.lowerBound(after.indexKey) : undefined;
      const request = store.index(UPDATE_TIME_INDEX).openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;

        // lowerBound is inclusive. Skip records already read in the previous batch.
        if (after && isAtOrBefore(cursor, after)) {
          cursor.continue();
          return;
        }

        // One extra record tells us whether another batch exists.
        if (records.length >= limit) {
          hasMore = true;
          return;
        }

        records.push({
          primaryKey: cursor.primaryKey,
          indexKey: cursor.key,
          value: cursor.value,
        });

        nextCursor = {
          indexKey: cursor.key,
          primaryKey: cursor.primaryKey,
        };

        cursor.continue();
      };

      return () => ({ records, nextCursor, done: !hasMore });
    });
  }

  async readNewest(limit = 10, signal?: AbortSignal): Promise<SourceRecord[]> {
    const records: SourceRecord[] = [];
    return this.readOnly(signal, (store) => {
      const request = store.index(UPDATE_TIME_INDEX).openCursor(null, "prev");
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || records.length >= limit) return;
        records.push({
          primaryKey: cursor.primaryKey,
          indexKey: cursor.key,
          value: cursor.value,
        });
        cursor.continue();
      };
      return () => records;
    });
  }

  async readHead(signal?: AbortSignal): Promise<SourceCursor | null> {
    const [record] = await this.readNewest(1, signal);
    return record
      ? { indexKey: record.indexKey, primaryKey: record.primaryKey }
      : null;
  }

  close(): void {
    this.database?.close();
    this.database = null;
    this.schema = null;
  }

  private async openAndValidate(): Promise<GrokSourceSchema> {
    const db = await openExistingDatabase();

    try {
      const schema = readSchema(db);
      validateSchema(schema);

      db.onversionchange = () => {
        db.close();

        if (this.database === db) {
          this.database = null;
          this.schema = null;
        }
      };

      this.database = db;
      this.schema = schema;
      return schema;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) {
      throw new Error("GrokSourceReader is not open. Call open() first.");
    }

    return this.database;
  }

  private readOnly<T>(
    signal: AbortSignal | undefined,
    schedule: (store: IDBObjectStore) => () => T,
  ): Promise<T> {
    const db = this.requireDatabase();
    signal?.throwIfAborted();

    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(CONVERSATIONS_STORE, "readonly");

      let settled = false;
      let buildResult: (() => T) | null = null;

      const settle = (finish: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        finish();
      };

      const abortTransaction = () => {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed.
        }
      };

      const onAbort = () => {
        settle(() =>
          reject(
            signal?.reason ??
              new DOMException("The operation was aborted.", "AbortError"),
          ),
        );
        abortTransaction();
      };

      transaction.oncomplete = () => {
        settle(() => {
          if (!buildResult) {
            reject(
              new Error("IndexedDB read completed without a result builder."),
            );
            return;
          }

          resolve(buildResult());
        });
      };

      transaction.onabort = () =>
        settle(() =>
          reject(
            transaction.error ??
              new Error("Grok IndexedDB read transaction aborted."),
          ),
        );

      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        buildResult = schedule(transaction.objectStore(CONVERSATIONS_STORE));
      } catch (error) {
        settle(() => reject(error));
        abortTransaction();
      }
    });
  }
}

function normalizeBatchSize(value = DEFAULT_BATCH_SIZE): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;

  return Math.max(1, Math.min(Math.floor(value), MAX_BATCH_SIZE));
}

function isAtOrBefore(cursor: IDBCursor, checkpoint: SourceCursor): boolean {
  const indexComparison = indexedDB.cmp(cursor.key, checkpoint.indexKey);

  if (indexComparison !== 0) return indexComparison < 0;

  return indexedDB.cmp(cursor.primaryKey, checkpoint.primaryKey) <= 0;
}

function copyKeyPath(keyPath: KeyPath): KeyPath {
  return Array.isArray(keyPath) ? [...keyPath] : keyPath;
}

function openExistingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Opening without a version avoids specifying a version, but can create a
    // missing database. Abort that upgrade so the reader never creates one.
    const request = indexedDB.open(DATABASE_NAME);
    let missingDatabase = false;

    request.onupgradeneeded = () => {
      missingDatabase = true;
      request.transaction?.abort();
    };

    request.onerror = () => {
      reject(
        missingDatabase
          ? new Error(
              `${DATABASE_NAME} was not found on this origin. Open Grok first and verify the database name.`,
            )
          : (request.error ?? new Error(`Could not open ${DATABASE_NAME}.`)),
      );
    };

    request.onsuccess = () => resolve(request.result);
  });
}

function readSchema(db: IDBDatabase): GrokSourceSchema {
  const stores: GrokSourceSchema["stores"] = {};
  const storeNames = Array.from(db.objectStoreNames);

  if (storeNames.length > 0) {
    const transaction = db.transaction(storeNames, "readonly");

    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      const indexes: Record<string, KeyPath> = {};

      for (const indexName of Array.from(store.indexNames)) {
        indexes[indexName] = copyKeyPath(store.index(indexName).keyPath);
      }

      stores[storeName] = {
        keyPath: copyKeyPath(store.keyPath),
        indexes,
      };
    }
  }

  return {
    databaseName: db.name,
    databaseVersion: db.version,
    stores,
  };
}

function validateSchema(schema: GrokSourceSchema): void {
  const conversations = schema.stores[CONVERSATIONS_STORE];

  if (!conversations) {
    throw new Error(
      `Grok database is missing the '${CONVERSATIONS_STORE}' store.`,
    );
  }

  if (conversations.keyPath !== "id") {
    throw new Error(
      `Unexpected '${CONVERSATIONS_STORE}' key path; expected 'id'.`,
    );
  }

  if (conversations.indexes[UPDATE_TIME_INDEX] !== "update_time") {
    throw new Error(
      `Unexpected '${CONVERSATIONS_STORE}.${UPDATE_TIME_INDEX}' index; expected key path 'update_time'.`,
    );
  }
}
