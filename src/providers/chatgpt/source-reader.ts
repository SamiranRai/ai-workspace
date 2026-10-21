const DATABASE_NAME = "ChatHistoryDB";
const METADATA_STORE = "conversationMeta";
const CONVERSATIONS_STORE = "conversations";
const METADATA_UPDATE_INDEX = "updateTimeIndex";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 250;
const MAX_LOOKUP_BATCH_SIZE = 50;

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
  records: Array<SourceRecord<T>>;
  nextCursor: SourceCursor | null;
  done: boolean;
}

export interface ConversationLookupResult {
  requestedId: string;
  record: unknown | null;
}

export interface ChatGPTSourceSchema {
  databaseName: string;
  databaseVersion: number;
  stores: Record<
    string,
    {
      keyPath: string | string[] | null;
      indexes: Record<string, string | string[] | null>;
    }
  >;
}

/** Read-only adapter for ChatGPT's origin IndexedDB. */
export class ChatGPTSourceReader {
  private database: IDBDatabase | null = null;
  private opening: Promise<ChatGPTSourceSchema> | null = null;

  async open(): Promise<ChatGPTSourceSchema> {
    if (this.database) return this.getSchema(this.database);
    if (this.opening) return this.opening;

    this.opening = this.openAndValidate();
    try {
      return await this.opening;
    } finally {
      this.opening = null;
    }
  }

  /** Scan the lightweight metadata directory, ordered by update_time. */
  async readMetadataBatch(
    options: {
      after?: SourceCursor | null;
      limit?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<SourceBatch> {
    const db = this.requireDatabase();
    this.throwIfAborted(options.signal);

    const limit = this.limit(options.limit);
    const after = options.after ?? null;

    // Scan the metadata store in a read-only transaction, using the update_time index.
    const tx = db.transaction(METADATA_STORE, "readonly");
    const index = tx.objectStore(METADATA_STORE).index(METADATA_UPDATE_INDEX);

    const records: Array<SourceRecord> = [];

    // The next cursor to return, which is the last record read.
    let nextCursor = after;
    let hasMore = false;

    return this.readTransaction(
      tx,
      options.signal,
      (fail) => {
        const range = after
          ? IDBKeyRange.lowerBound(after.indexKey)
          : undefined;
        const request = index.openCursor(range, "next");

        request.onerror = () =>
          fail(request.error ?? new Error("Metadata scan failed."));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;

          if (after && this.isAtOrBefore(cursor, after)) {
            cursor.continue();
            return;
          }

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
      },
      // Return the batch result.
      () => ({
        records,
        nextCursor: records.length ? nextCursor : after,
        done: !hasMore,
      }),
    );
  }

  /** Throw an error if the signal is aborted. */
  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    if (signal.reason instanceof Error) {
      throw signal.reason;
    }

    throw new DOMException("The operation was aborted.", "AbortError");
  }

  /** Read full conversation records by their source IDs. */
  async getConversationsByIds(
    ids: string[],
    signal?: AbortSignal,
  ): Promise<ConversationLookupResult[]> {
    const db = this.requireDatabase();
    this.throwIfAborted(signal);

    if (ids.length > MAX_LOOKUP_BATCH_SIZE) {
      throw new Error(
        `Read no more than ${MAX_LOOKUP_BATCH_SIZE} conversations per batch.`,
      );
    }
    if (!ids.length) return [];

    const tx = db.transaction(CONVERSATIONS_STORE, "readonly");
    const store = tx.objectStore(CONVERSATIONS_STORE);
    const values: Array<unknown | null> = new Array(ids.length).fill(null);

    return this.readTransaction(
      tx,
      signal,
      (fail) => {
        ids.forEach((id, index) => {
          const request = store.get(id);
          request.onsuccess = () => {
            values[index] = request.result ?? null;
          };
          request.onerror = () => {
            fail(request.error ?? new Error("Conversation lookup failed."));
          };
        });
      },
      () =>
        ids.map((requestedId, index) => ({
          requestedId,
          record: values[index],
        })),
    );
  }

  close(): void {
    const db = this.database;
    this.database = null;
    db?.close();
  }

  private async openAndValidate(): Promise<ChatGPTSourceSchema> {
    if (typeof indexedDB.databases !== "function") {
      throw new Error("IndexedDB database enumeration is not supported.");
    }

    const databases = await indexedDB.databases();
    if (!databases.some((item) => item.name === DATABASE_NAME)) {
      throw new Error(`${DATABASE_NAME} was not found on this origin.`);
    }

    const db = await this.openExistingDatabase();

    try {
      const schema = this.getSchema(db);
      this.validateSchema(schema);

      db.onversionchange = () => {
        db.close();
        if (this.database === db) this.database = null;
      };

      this.database = db;
      return schema;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private openExistingDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME);
      let settled = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        try {
          request.transaction?.abort();
        } catch {
          // The open transaction may already have ended.
        }
        reject(error);
      };

      request.onupgradeneeded = () => {
        fail(new Error(`${DATABASE_NAME} disappeared; refusing to create it.`));
      };
      request.onerror = () => {
        fail(request.error ?? new Error(`Could not open ${DATABASE_NAME}.`));
      };
      request.onblocked = () => {
        fail(new Error(`Opening ${DATABASE_NAME} is blocked.`));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        resolve(db);
      };
    });
  }

  /** Get the schema of the database. */
  private getSchema(db: IDBDatabase): ChatGPTSourceSchema {
    const stores: ChatGPTSourceSchema["stores"] = {};
    const names = Array.from(db.objectStoreNames);
    const tx = db.transaction(names, "readonly");

    for (const name of names) {
      const store = tx.objectStore(name);
      const indexes: Record<string, string | string[] | null> = {};

      for (const indexName of Array.from(store.indexNames)) {
        indexes[indexName] = this.copyKeyPath(store.index(indexName).keyPath);
      }

      stores[name] = {
        keyPath: this.copyKeyPath(store.keyPath),
        indexes,
      };
    }

    return {
      databaseName: db.name,
      databaseVersion: db.version,
      stores,
    };
  }

  private validateSchema(schema: ChatGPTSourceSchema): void {
    const metadata = schema.stores[METADATA_STORE];
    const conversations = schema.stores[CONVERSATIONS_STORE];

    if (!metadata) throw new Error(`Missing store: ${METADATA_STORE}.`);
    if (!conversations)
      throw new Error(`Missing store: ${CONVERSATIONS_STORE}.`);
    if (metadata.keyPath !== "id")
      throw new Error(`Unexpected ${METADATA_STORE} key path.`);
    if (conversations.keyPath !== "id")
      throw new Error(`Unexpected ${CONVERSATIONS_STORE} key path.`);
    if (metadata.indexes[METADATA_UPDATE_INDEX] !== "update_time") {
      throw new Error(
        `Unexpected ${METADATA_STORE}.${METADATA_UPDATE_INDEX} index.`,
      );
    }
  }

  private readTransaction<T>(
    tx: IDBTransaction,
    signal: AbortSignal | undefined,
    schedule: (fail: (error: unknown) => void) => void,
    result: () => T,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal?.removeEventListener("abort", onAbort);

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          tx.abort();
        } catch {
          // The transaction may already have ended.
        }
        reject(error);
      };

      const onAbort = () =>
        fail(new DOMException("Read aborted.", "AbortError"));

      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          resolve(result());
        } catch (error) {
          reject(error);
        }
      };
      tx.onerror = () => fail(tx.error ?? new Error("IndexedDB read failed."));
      tx.onabort = () => fail(tx.error ?? new Error("IndexedDB read aborted."));

      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }

      try {
        schedule(fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  /** Ensure the database is open and return it. */
  private requireDatabase(): IDBDatabase {
    if (!this.database)
      throw new Error("Call open() before reading source data.");
    return this.database;
  }

  /** Normalize the batch size to a valid range. */
  private limit(value = DEFAULT_BATCH_SIZE): number {
    if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
    return Math.max(1, Math.min(Math.floor(value), MAX_BATCH_SIZE));
  }

  private isAtOrBefore(cursor: IDBCursor, checkpoint: SourceCursor): boolean {
    const keyComparison = indexedDB.cmp(cursor.key, checkpoint.indexKey);
    if (keyComparison < 0) return true;
    if (keyComparison > 0) return false;
    return indexedDB.cmp(cursor.primaryKey, checkpoint.primaryKey) <= 0;
  }

  private copyKeyPath(
    keyPath: string | string[] | null,
  ): string | string[] | null {
    return Array.isArray(keyPath) ? [...keyPath] : keyPath;
  }
}
