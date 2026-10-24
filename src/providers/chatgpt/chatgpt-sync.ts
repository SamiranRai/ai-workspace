import { upsertConversations } from "../../storage/storage-client";
import type { ConversationRecord } from "../../types/conversation";
import { normalizeChatGPTConversation } from "./conversation-normalizer";
import { ChatGPTSourceReader, type SourceCursor } from "./source-reader";

const BATCH_SIZE = 50;
const SYNC_LOCK_NAME = "smart-folder:chatgpt-sync";

export interface SyncFailure {
  id: string;
  reason: string;
}

export interface SyncSummary {
  scanned: number;
  saved: number;
  missing: number; // listed in metadata but gone by the time it was read
  failures: SyncFailure[];
}

interface BatchResult {
  saved: number;
  missing: number;
  failures: SyncFailure[];
}

/** Runs one full sync, or returns null when another tab already holds the lock. */
export function syncChatGPTHistory(
  signal?: AbortSignal,
): Promise<SyncSummary | null> {
  return new Promise((resolve, reject) => {
    void navigator.locks.request(
      SYNC_LOCK_NAME,
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        void runSync(signal).then(resolve, reject);
      },
    ).catch(reject);
  });
}

async function runSync(signal?: AbortSignal): Promise<SyncSummary> {
  const reader = new ChatGPTSourceReader();
  const syncedAt = Date.now();
  const summary: SyncSummary = {
    scanned: 0,
    saved: 0,
    missing: 0,
    failures: [],
  };

  try {
    await reader.open();

    let cursor: SourceCursor | null = null;
    let done = false;

    while (!done) {
      const batch = await reader.readMetadataBatch({
        after: cursor,
        limit: BATCH_SIZE,
        signal,
      });
      const ids = batch.records.map((record) =>
        toConversationId(record.primaryKey),
      );
      const result = await syncBatch(reader, ids, syncedAt, signal);

      summary.scanned += ids.length;
      summary.saved += result.saved;
      summary.missing += result.missing;
      summary.failures.push(...result.failures);

      cursor = batch.nextCursor;
      done = batch.done;
    }

    return summary;
  } finally {
    reader.close();
  }
}

async function syncBatch(
  reader: ChatGPTSourceReader,
  ids: string[],
  syncedAt: number,
  signal?: AbortSignal,
): Promise<BatchResult> {
  const lookups = await reader.getConversationsByIds(ids, signal);

  const records: ConversationRecord[] = [];
  const failures: SyncFailure[] = [];
  let missing = 0;

  for (const { requestedId, record } of lookups) {
    if (record === null) {
      missing++;
      continue;
    }

    try {
      records.push(normalizeChatGPTConversation(record, syncedAt));
    } catch (error) {
      failures.push({ id: requestedId, reason: toMessage(error) });
    }
  }

  if (records.length === 0) return { saved: 0, missing, failures };

  const { conversationsSaved } = await upsertConversations(records);
  return { saved: conversationsSaved, missing, failures };
}

function toConversationId(key: IDBValidKey): string {
  if (typeof key !== "string") {
    throw new Error("Unexpected non-string conversation ID in metadata store.");
  }
  return key;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
