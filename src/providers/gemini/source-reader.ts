const DATABASE_NAME = "GeminiToolboxDB";
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

export interface GeminiSourceSchema {
  databaseName: string;
  databaseVersion: number;
  stores: Record<
    string,
    { keyPath: KeyPath; indexes: Record<string, KeyPath> }
  >;
}

/** Read-only adapter for Gemini's origin IndexedDB. */
export class GeminiSourceReader {
  private database: IDBDatabase | null = null;
  private schema: GeminiSourceSchema | null = null;
  private opening: Promise<GeminiSourceSchema> | null = null;

  async open(): Promise<GeminiSourceSchema> {
    if (this.database && this.schema) return this.schema;

    this.opening ??= this.openAndValidate().finally(() => {
      this.opening = null;
    });

    return this.opening;
  }

  /** Read conversation records in update_time order, using a resumable cursor. */
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

        // lowerBound is inclusive. Skip entries already returned in the last batch.
        if (after && isAtOrBefore(cursor, after)) {
          cursor.continue();
          return;
        }

        // Read one extra record to determine whether another batch exists.
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

  close(): void {
    this.database?.close();
    this.database = null;
    this.schema = null;
  }

  private async openAndValidate(): Promise<GeminiSourceSchema> {
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
      throw new Error("GeminiSourceReader is not open. Call open() first.");
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
              new Error("Gemini IndexedDB read transaction aborted."),
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
  const byIndex = indexedDB.cmp(cursor.key, checkpoint.indexKey);

  if (byIndex !== 0) return byIndex < 0;

  return indexedDB.cmp(cursor.primaryKey, checkpoint.primaryKey) <= 0;
}

function copyKeyPath(keyPath: KeyPath): KeyPath {
  return Array.isArray(keyPath) ? [...keyPath] : keyPath;
}

function openExistingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Opening without a version can create a missing database. Abort any upgrade
    // so this read-only adapter never creates a database accidentally.
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
              `${DATABASE_NAME} was not found on this origin. Open Gemini and verify the database name.`,
            )
          : (request.error ?? new Error(`Could not open ${DATABASE_NAME}.`)),
      );
    };

    request.onsuccess = () => resolve(request.result);
  });
}

function readSchema(db: IDBDatabase): GeminiSourceSchema {
  const stores: GeminiSourceSchema["stores"] = {};
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

function validateSchema(schema: GeminiSourceSchema): void {
  const conversations = schema.stores[CONVERSATIONS_STORE];

  if (!conversations) {
    throw new Error(
      `Gemini database is missing the '${CONVERSATIONS_STORE}' store.`,
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
