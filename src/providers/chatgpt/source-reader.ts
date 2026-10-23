const DATABASE_NAME = "ChatHistoryDB";
const METADATA_STORE = "conversationMeta";
const CONVERSATIONS_STORE = "conversations";
const UPDATE_TIME_INDEX = "updateTimeIndex";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 250;
const MAX_LOOKUP_BATCH_SIZE = 50;

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

export interface ConversationLookupResult {
  requestedId: string;
  record: unknown; // null when the conversation does not exist
}

export interface ChatGPTSourceSchema {
  databaseName: string;
  databaseVersion: number;
  stores: Record<
    string,
    { keyPath: KeyPath; indexes: Record<string, KeyPath> }
  >;
}

/** Read-only adapter for ChatGPT's origin IndexedDB. */
export class ChatGPTSourceReader {
  private database: IDBDatabase | null = null;
  private schema: ChatGPTSourceSchema | null = null;
  private opening: Promise<ChatGPTSourceSchema> | null = null;

  async open(): Promise<ChatGPTSourceSchema> {
    if (this.schema) return this.schema;

    this.opening ??= this.openAndValidate().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  /** Scan conversation metadata ordered by update time, resuming after `after`. */
  async readMetadataBatch(
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

    return this.readOnly(METADATA_STORE, options.signal, (store) => {
      const range = after ? IDBKeyRange.lowerBound(after.indexKey) : undefined;
      const request = store.index(UPDATE_TIME_INDEX).openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;

        // The range is inclusive, so skip entries already consumed.
        if (after && isAtOrBefore(cursor, after)) {
          cursor.continue();
          return;
        }

        // One extra record proves there is another page.
        if (records.length >= limit) {
          hasMore = true;
          return;
        }

        records.push({
          primaryKey: cursor.primaryKey,
          indexKey: cursor.key,
          value: cursor.value,
        });
        nextCursor = { indexKey: cursor.key, primaryKey: cursor.primaryKey };
        cursor.continue();
      };

      return () => ({ records, nextCursor, done: !hasMore });
    });
  }

  /** Read full conversation records by ID, preserving request order. */
  async getConversationsByIds(
    ids: string[],
    signal?: AbortSignal,
  ): Promise<ConversationLookupResult[]> {
    if (ids.length > MAX_LOOKUP_BATCH_SIZE) {
      throw new Error(
        `Read no more than ${MAX_LOOKUP_BATCH_SIZE} conversations per batch.`,
      );
    }
    if (!ids.length) return [];

    const records: unknown[] = new Array(ids.length).fill(null);

    return this.readOnly(CONVERSATIONS_STORE, signal, (store) => {
      ids.forEach((id, i) => {
        store.get(id).onsuccess = (event) => {
          records[i] = (event.target as IDBRequest).result ?? null;
        };
      });

      return () =>
        ids.map((requestedId, i) => ({ requestedId, record: records[i] }));
    });
  }

  close(): void {
    this.database?.close();
    this.database = null;
    this.schema = null;
  }

  private async openAndValidate(): Promise<ChatGPTSourceSchema> {
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
    if (!this.database)
      throw new Error("Call open() before reading source data.");
    return this.database;
  }

  /** Run a single-store read transaction; `schedule` queues requests and returns the result builder. */
  private readOnly<T>(
    storeName: string,
    signal: AbortSignal | undefined,
    schedule: (store: IDBObjectStore) => () => T,
  ): Promise<T> {
    const db = this.requireDatabase();
    signal?.throwIfAborted();

    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      let settled = false;

      const settle = (finish: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        finish();
      };

      const abortTransaction = () => {
        try {
          tx.abort();
        } catch {
          // Already finished.
        }
      };

      const onAbort = () => {
        settle(() => reject(signal?.reason));
        abortTransaction();
      };

      let buildResult: () => T;

      tx.oncomplete = () => settle(() => resolve(buildResult()));
      tx.onabort = () =>
        settle(() => reject(tx.error ?? new Error("IndexedDB read aborted.")));

      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        buildResult = schedule(tx.objectStore(storeName));
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
    const request = indexedDB.open(DATABASE_NAME);
    let missing = false;

    // Opening without a version creates a missing DB, so abort the upgrade.
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction?.abort();
    };
    request.onerror = () =>
      reject(
        missing
          ? new Error(`${DATABASE_NAME} was not found on this origin.`)
          : (request.error ?? new Error(`Could not open ${DATABASE_NAME}.`)),
      );
    request.onsuccess = () => resolve(request.result);
  });
}

function readSchema(db: IDBDatabase): ChatGPTSourceSchema {
  const names = Array.from(db.objectStoreNames);
  const stores: ChatGPTSourceSchema["stores"] = {};

  if (names.length) {
    const tx = db.transaction(names, "readonly");

    for (const name of names) {
      const store = tx.objectStore(name);
      const indexes: Record<string, KeyPath> = {};

      for (const indexName of Array.from(store.indexNames)) {
        indexes[indexName] = copyKeyPath(store.index(indexName).keyPath);
      }

      stores[name] = { keyPath: copyKeyPath(store.keyPath), indexes };
    }
  }

  return { databaseName: db.name, databaseVersion: db.version, stores };
}

function validateSchema(schema: ChatGPTSourceSchema): void {
  const metadata = schema.stores[METADATA_STORE];
  const conversations = schema.stores[CONVERSATIONS_STORE];

  if (!metadata) throw new Error(`Missing store: ${METADATA_STORE}.`);
  if (!conversations) throw new Error(`Missing store: ${CONVERSATIONS_STORE}.`);
  if (metadata.keyPath !== "id") {
    throw new Error(`Unexpected ${METADATA_STORE} key path.`);
  }
  if (conversations.keyPath !== "id") {
    throw new Error(`Unexpected ${CONVERSATIONS_STORE} key path.`);
  }
  if (metadata.indexes[UPDATE_TIME_INDEX] !== "update_time") {
    throw new Error(`Unexpected ${METADATA_STORE}.${UPDATE_TIME_INDEX} index.`);
  }
}
