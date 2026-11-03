import { getSyncCheckpoint, upsertConversations } from "../../storage/storage-client";
import type { ConversationRecord } from "../../types/conversation";
import type { SyncCheckpoint } from "../../types/sync";
import { normalizeChatGPTConversation, toTimestamp } from "./conversation-normalizer";
import {
  ChatGPTSourceReader,
  type SourceBatch,
  type SourceCursor,
  type SourceRecord,
} from "./source-reader";

const BATCH_SIZE = 50;
const RECENT_WINDOW = 5;
const IN_FLIGHT_WINDOW_MS = 120_000;
const MAX_CHUNK_WEIGHT = 4_000_000;
const RECORD_BASE_WEIGHT = 1_000;
const SYNC_LOCK_NAME = "smart-folder:chatgpt-sync";

export const CHATGPT_CHECKPOINT_KEY = "chatgpt";

export interface SyncFailure {
  id: string;
  reason: string;
}

export interface SyncOptions {
  acceptPartial?: boolean;
  signal?: AbortSignal;
}

export interface SyncSummary {
  scanned: number;
  saved: number;
  unchanged: number;
  failures: SyncFailure[];
  head: SourceCursor | null;
  held: boolean;
}

export interface SourceRef {
  id: string;
  meta: unknown;
}

export interface LoadedBatch {
  records: ConversationRecord[];
  failures: SyncFailure[];
  holdAt: number;
}

export function withSyncLock<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return navigator.locks.request(
    SYNC_LOCK_NAME,
    signal ? { signal } : {},
    async () => task(),
  ) as Promise<T>;
}

export function syncChatGPTHistory(
  options: SyncOptions = {},
): Promise<SyncSummary> {
  return withSyncLock(() => runSync(options), options.signal);
}

async function runSync({
  acceptPartial = false,
  signal,
}: SyncOptions): Promise<SyncSummary> {
  const reader = new ChatGPTSourceReader();
  const syncedAt = Date.now();
  const summary: SyncSummary = {
    scanned: 0,
    saved: 0,
    unchanged: 0,
    failures: [],
    head: null,
    held: false,
  };
  const seen = new Set<string>();

  try {
    await reader.open();
    summary.head = await reader.readHead(signal);
    const stored = await getSyncCheckpoint(CHATGPT_CHECKPOINT_KEY);
    let scanFrom: SourceCursor | null = stored?.cursor
      ? { ...stored.cursor }
      : null;
    let committed = scanFrom;
    let persisted = scanFrom;
    let done = false;

    while (!done) {
      const batch = await reader.readMetadataBatch({
        after: scanFrom,
        limit: BATCH_SIZE,
        signal,
      });
      const refs = toRefs(batch.records);
      const loaded = await loadBatch(
        reader,
        refs,
        syncedAt,
        acceptPartial,
        signal,
      );
      refs.forEach((ref) => seen.add(ref.id));

      const resolved = resolveCommitted(
        committed,
        batch,
        loaded.holdAt,
        summary.held,
      );
      committed = resolved.committed;
      summary.held = resolved.held;
      const checkpoint =
        committed && committed !== persisted
          ? toCheckpoint(committed, syncedAt)
          : undefined;
      const result = await saveRecords(loaded.records, checkpoint);
      if (checkpoint) persisted = committed;

      summary.scanned += refs.length;
      summary.saved += result.saved;
      summary.unchanged += result.unchanged;
      summary.failures.push(...loaded.failures);
      scanFrom = batch.nextCursor;
      done = batch.done || loaded.holdAt >= 0;
    }

    const recent = toRefs(await reader.readNewestMetadata(RECENT_WINDOW, signal))
      .filter((ref) => !seen.has(ref.id));
    const refreshed = await loadBatch(reader, recent, syncedAt, false, signal);
    const result = await saveRecords(refreshed.records);
    summary.saved += result.saved;
    summary.unchanged += result.unchanged;
    summary.failures.push(...refreshed.failures);
    return summary;
  } finally {
    reader.close();
  }
}

function toRefs(records: SourceRecord[]): SourceRef[] {
  return records.flatMap((record) => {
    if (typeof record.primaryKey !== "string") {
      throw new Error("Unexpected non-string conversation ID in metadata store.");
    }
    return [{ id: record.primaryKey, meta: record.value }];
  });
}

async function loadBatch(
  reader: ChatGPTSourceReader,
  refs: SourceRef[],
  syncedAt: number,
  acceptPartial: boolean,
  signal?: AbortSignal,
): Promise<LoadedBatch> {
  const lookups = await reader.getConversationsByIds(
    refs.map((ref) => ref.id),
    signal,
  );
  const records: ConversationRecord[] = [];
  const failures: SyncFailure[] = [];
  let holdAt = -1;

  for (let index = 0; index < lookups.length; index++) {
    const { requestedId, record } = lookups[index];
    if (record === null) {
      if (!acceptPartial && isRecent(refs[index].meta, syncedAt, IN_FLIGHT_WINDOW_MS)) {
        holdAt = index;
        break;
      }
      failures.push({ id: requestedId, reason: "Conversation body is missing." });
      continue;
    }
    try {
      records.push(normalizeChatGPTConversation(record, syncedAt));
    } catch (error) {
      failures.push({ id: requestedId, reason: toMessage(error) });
    }
  }
  return { records, failures, holdAt };
}

function resolveCommitted(
  current: SourceCursor | null,
  batch: SourceBatch,
  holdAt: number,
  alreadyHeld: boolean,
): { committed: SourceCursor | null; held: boolean } {
  if (holdAt >= 0) {
    const before = holdAt === 0 ? current : batch.records[holdAt - 1];
    return {
      committed: before
        ? { indexKey: before.indexKey as string, primaryKey: before.primaryKey as string }
        : current,
      held: true,
    };
  }
  return {
    committed: batch.nextCursor,
    held: alreadyHeld && !batch.done,
  };
}

async function saveRecords(
  records: ConversationRecord[],
  checkpoint?: SyncCheckpoint,
): Promise<{ saved: number; unchanged: number }> {
  if (records.length === 0) {
    if (checkpoint) await upsertConversations([], checkpoint);
    return { saved: 0, unchanged: 0 };
  }
  let saved = 0;
  let unchanged = 0;
  let weight = 0;
  const chunks: ConversationRecord[][] = [[]];
  for (const record of records) {
    const recordWeight =
      RECORD_BASE_WEIGHT + JSON.stringify(record).length;
    if (chunks.at(-1)!.length > 0 && weight + recordWeight > MAX_CHUNK_WEIGHT) {
      chunks.push([]);
      weight = 0;
    }
    chunks.at(-1)!.push(record);
    weight += recordWeight;
  }
  for (let index = 0; index < chunks.length; index++) {
    const result = await upsertConversations(
      chunks[index],
      index === chunks.length - 1 ? checkpoint : undefined,
    );
    saved += result.conversationsSaved;
    unchanged += result.conversationsUnchanged;
  }
  return { saved, unchanged };
}

function toCheckpoint(cursor: SourceCursor, checkedAt: number): SyncCheckpoint {
  if (typeof cursor.indexKey !== "string" || typeof cursor.primaryKey !== "string") {
    throw new Error("Checkpoint cursor keys must be strings.");
  }
  return {
    key: CHATGPT_CHECKPOINT_KEY,
    cursor: { indexKey: cursor.indexKey, primaryKey: cursor.primaryKey },
    checkedAt,
  };
}

function isRecent(value: unknown, now: number, windowMs: number): boolean {
  if (!value || typeof value !== "object") return false;
  const timestamp = toTimestamp((value as Record<string, unknown>).update_time);
  return timestamp !== null && now - timestamp <= windowMs && now - timestamp >= -windowMs;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
