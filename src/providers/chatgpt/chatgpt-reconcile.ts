import {
  listConversationDigests,
  markDeletedAtSource,
  upsertConversations,
} from "../../storage/storage-client";
import { normalizeChatGPTConversation, toTimestamp } from "./conversation-normalizer";
import { ChatGPTSourceReader } from "./source-reader";
import {
  withSyncLock,
  type SyncFailure,
  type SourceRef,
} from "./chatgpt-sync";

const PLATFORM = "chatgpt" as const;
const LOOKUP_SIZE = 50;
const MAX_TOMBSTONE_RATIO = 0.2;
const MIN_TOMBSTONE_ALLOWANCE = 5;
const COUNT_CHECK_WINDOW_MS = 60 * 60_000;

export interface ReconcileSummary {
  sourceCount: number;
  refreshed: number;
  tombstoned: number;
  tombstoneSkipped: boolean;
  failures: SyncFailure[];
}

interface MetadataEntry {
  id: string;
  messageCount: number | null;
  meta: unknown;
}

export function reconcileChatGPTHistory(
  signal?: AbortSignal,
): Promise<ReconcileSummary> {
  return withSyncLock(() => runReconcile(signal), signal);
}

async function runReconcile(signal?: AbortSignal): Promise<ReconcileSummary> {
  const reader = new ChatGPTSourceReader();
  const syncedAt = Date.now();
  const summary: ReconcileSummary = {
    sourceCount: 0,
    refreshed: 0,
    tombstoned: 0,
    tombstoneSkipped: false,
    failures: [],
  };

  try {
    await reader.open();
    const entries = parseMetadata(await reader.readAllMetadata(signal));
    const local = await listConversationDigests(PLATFORM);
    const localById = new Map(local.map((digest) => [digest.id, digest]));
    summary.sourceCount = entries.length;

    const stale = entries.filter((entry) => {
      const digest = localById.get(entry.id);
      return (
        !digest ||
        digest.deletedAtSource !== null ||
        (entry.messageCount !== null &&
          digest.messageCount !== entry.messageCount &&
          isRecent(entry.meta, syncedAt))
      );
    });

    for (let index = 0; index < stale.length; index += LOOKUP_SIZE) {
      const refs = stale.slice(index, index + LOOKUP_SIZE).map(({ id, meta }) => ({
        id,
        meta,
      }));
      const result = await refreshBatch(reader, refs, syncedAt, signal);
      summary.refreshed += result.saved;
      summary.failures.push(...result.failures);
    }

    const sourceIds = new Set(entries.map((entry) => entry.id));
    const live = local.filter((digest) => digest.deletedAtSource === null);
    const gone = live
      .filter((digest) => !sourceIds.has(digest.id))
      .map((digest) => digest.id);
    if (gone.length > 0) {
      const implausible =
        sourceIds.size === 0 ||
        gone.length > Math.max(MIN_TOMBSTONE_ALLOWANCE, live.length * MAX_TOMBSTONE_RATIO);
      if (implausible) {
        summary.tombstoneSkipped = true;
      } else {
        summary.tombstoned = await markDeletedAtSource(PLATFORM, gone, syncedAt);
      }
    }
    return summary;
  } finally {
    reader.close();
  }
}

async function refreshBatch(
  reader: ChatGPTSourceReader,
  refs: SourceRef[],
  syncedAt: number,
  signal?: AbortSignal,
): Promise<{ saved: number; failures: SyncFailure[] }> {
  const lookups = await reader.getConversationsByIds(
    refs.map((ref) => ref.id),
    signal,
  );
  const records = [];
  const failures: SyncFailure[] = [];
  for (let index = 0; index < lookups.length; index++) {
    const { requestedId, record } = lookups[index];
    if (record === null) {
      failures.push({ id: requestedId, reason: "Conversation body is missing." });
      continue;
    }
    try {
      records.push(normalizeChatGPTConversation(record, syncedAt));
    } catch (error) {
      failures.push({
        id: requestedId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (records.length === 0) return { saved: 0, failures };
  const result = await upsertConversations(records);
  return { saved: result.conversationsSaved, failures };
}

function parseMetadata(values: unknown[]): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as { id?: unknown; message_count?: unknown };
    if (typeof candidate.id !== "string" || candidate.id === "") continue;
    entries.push({
      id: candidate.id,
      messageCount:
        typeof candidate.message_count === "number"
          ? candidate.message_count
          : null,
      meta: value,
    });
  }
  return entries;
}

function isRecent(value: unknown, now: number): boolean {
  if (!value || typeof value !== "object") return false;
  const timestamp = toTimestamp(
    (value as Record<string, unknown>).update_time,
  );
  return (
    timestamp !== null &&
    now - timestamp <= COUNT_CHECK_WINDOW_MS &&
    now - timestamp >= -COUNT_CHECK_WINDOW_MS
  );
}
