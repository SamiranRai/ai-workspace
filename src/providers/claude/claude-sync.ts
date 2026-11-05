import { upsertConversations } from "../../storage/storage-client";
import type { ConversationRecord } from "../../types/conversation";
import { normalizeClaudeConversation } from "./conversation-normalizer";
import { ClaudeSourceReader, type SourceCursor } from "./source-reader";

const BATCH_SIZE = 50;
const SYNC_LOCK_NAME = "smart-folder:claude-sync";

export interface SyncFailure {
  id: string;
  reason: string;
}

export interface SyncSummary {
  scanned: number;
  saved: number;
  failures: SyncFailure[];
}

interface BatchResult {
  saved: number;
  failures: SyncFailure[];
}

/** Runs a full Claude history sync. Returns null if another tab owns the lock. */
export async function syncClaudeHistory(
  signal?: AbortSignal,
): Promise<SyncSummary | null> {
  if (!navigator.locks) {
    throw new Error(
      "This browser does not support Web Locks, required to prevent duplicate syncs.",
    );
  }

  return navigator.locks.request(
    SYNC_LOCK_NAME,
    { signal },
    async (lock) => {
      if (!lock) return null;
      return runSync(signal);
    },
  );
}

async function runSync(signal?: AbortSignal): Promise<SyncSummary> {
  const reader = new ClaudeSourceReader();
  const syncedAt = Date.now();
  const summary: SyncSummary = { scanned: 0, saved: 0, failures: [] };

  try {
    await reader.open();

    let cursor: SourceCursor | null = null;
    let done = false;

    while (!done) {
      signal?.throwIfAborted();
      const batch = await reader.readConversationBatch({
        after: cursor,
        limit: BATCH_SIZE,
        signal,
      });
      const result = await syncBatch(
        batch.records.map((record) => record.value),
        syncedAt,
      );

      summary.scanned += batch.records.length;
      summary.saved += result.saved;
      summary.failures.push(...result.failures);

      // Defensive guard: a non-empty page must advance the cursor.
      if (batch.records.length > 0 && sameCursor(batch.nextCursor, cursor)) {
        throw new Error(
          "Claude sync cursor did not advance; stopping to avoid an infinite loop.",
        );
      }
      cursor = batch.nextCursor;
      done = batch.done;
    }

    return summary;
  } finally {
    reader.close();
  }
}

async function syncBatch(
  values: unknown[],
  syncedAt: number,
): Promise<BatchResult> {
  const records: ConversationRecord[] = [];
  const failures: SyncFailure[] = [];

  for (const value of values) {
    const id = getConversationId(value);
    try {
      records.push(normalizeClaudeConversation(value, syncedAt));
    } catch (error) {
      failures.push({ id, reason: toMessage(error) });
    }
  }

  if (records.length === 0) return { saved: 0, failures };

  try {
    const { conversationsSaved } = await upsertConversations(records);
    return { saved: conversationsSaved, failures };
  } catch (error) {
    // Keep the batch-level error visible rather than silently losing the sync.
    failures.push({
      id: "<batch>",
      reason: `Could not save batch: ${toMessage(error)}`,
    });
    return { saved: 0, failures };
  }
}

function getConversationId(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }
  return "<unknown>";
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameCursor(
  left: SourceCursor | null,
  right: SourceCursor | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    indexedDB.cmp(left.indexKey, right.indexKey) === 0 &&
    indexedDB.cmp(left.primaryKey, right.primaryKey) === 0
  );
}
