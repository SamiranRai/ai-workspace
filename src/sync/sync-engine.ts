import {
  getSyncCheckpoint,
  upsertConversations,
} from "../storage/storage-client";
import type { ConversationRecord } from "../types/conversation";
import type { SyncCheckpoint } from "../types/sync";
import type { ProviderSource, SourceEntry } from "../providers/provider-source";

const BATCH_SIZE = 50;
const DEFAULT_OVERLAP = 10;
const MAX_CHUNK_WEIGHT = 4_000_000;
const RECORD_BASE_WEIGHT = 1_000;

export interface SyncFailure {
  id: string;
  reason: string;
}

export interface SyncOptions {
  signal?: AbortSignal;
  /** Ignore the saved bookmark and re-read everything. Safe, because saving is idempotent. */
  fromStart?: boolean;
}

export interface SyncSummary {
  platform: string;
  scanned: number;
  saved: number;
  failures: SyncFailure[];
  head: string | null; // newest source token observed before this run read anything
  pending: number; // recent conversations whose body looks incomplete
}

interface Loaded {
  records: ConversationRecord[];
  failures: SyncFailure[];
  pending: number;
}

// What this tab already saved, so repeated runs don't re-send unchanged conversations.
const savedFingerprints = new Map<string, string>();

function fingerprint(record: ConversationRecord): string {
  return `${record.sourceSignature}|${record.updatedAt}`;
}

/** One sync per provider at a time, across every tab of that provider. Queues; never drops. */
export async function syncProvider(
  source: ProviderSource,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const { signal } = options;

  return await navigator.locks.request(
    `smart-folder:sync:${source.platform}`,
    signal ? { signal } : {},
    () => run(source, options),
  );
}

async function run(
  source: ProviderSource,
  options: SyncOptions,
): Promise<SyncSummary> {
  const { signal, fromStart = false } = options;
  const syncedAt = Date.now();
  const summary: SyncSummary = {
    platform: source.platform,
    scanned: 0,
    saved: 0,
    failures: [],
    head: null,
    pending: 0,
  };

  try {
    await source.open();
    summary.head = await source.head(signal);

    let cursor: string | null = fromStart
      ? null
      : ((await getSyncCheckpoint(source.platform))?.cursor ?? null);
    let done = false;

    while (!done) {
      const page = await source.changedSince(cursor, BATCH_SIZE, signal);
      const loaded = await load(source, page.entries, syncedAt, signal);

      // The bookmark rides in the same transaction as the records it covers.
      // A full rescan only writes the bookmark once, at the end.
      const checkpoint: SyncCheckpoint | undefined =
        !fromStart && page.entries.length > 0 && page.next
          ? { key: source.platform, cursor: page.next, checkedAt: syncedAt }
          : undefined;

      summary.saved += await save(loaded.records, checkpoint, summary.failures);
      summary.scanned += page.entries.length;
      summary.failures.push(...loaded.failures);

      if (page.next) cursor = page.next;
      done = page.done;
    }

    // A conversation's body can land after its index entry. Re-reading the newest
    // few every run repairs that. Unchanged conversations are skipped.
    const overlapSize = source.overlap ?? DEFAULT_OVERLAP;

    if (overlapSize > 0) {
      const newest = await source.newest(overlapSize, signal);
      const overlap = await load(source, newest, syncedAt, signal);
      summary.saved += await save(overlap.records, undefined, summary.failures);
      summary.pending = overlap.pending;
      summary.failures.push(...overlap.failures);
    }

    // Only a run that got this far records that the provider was checked.
    if (cursor) {
      await upsertConversations([], {
        key: source.platform,
        cursor,
        checkedAt: syncedAt,
      });
    }

    return summary;
  } finally {
    source.close();
  }
}

async function load(
  source: ProviderSource,
  entries: SourceEntry[],
  now: number,
  signal?: AbortSignal,
): Promise<Loaded> {
  const loaded: Loaded = { records: [], failures: [], pending: 0 };
  if (entries.length === 0) return loaded;

  const lookups = await source.load(
    entries.map((entry) => entry.id),
    signal,
  );

  lookups.forEach(({ id, raw }, index) => {
    if (source.isIncomplete(raw, entries[index].meta, now)) loaded.pending++;
    if (raw === null) return;

    try {
      loaded.records.push(source.normalize(raw, now));
    } catch (error) {
      loaded.failures.push({ id, reason: toMessage(error) });
    }
  });

  return loaded;
}

/** Saves in size-limited chunks. The bookmark rides on the last chunk. A failing chunk is retried record by record. */
async function save(
  records: ConversationRecord[],
  checkpoint: SyncCheckpoint | undefined,
  failures: SyncFailure[],
): Promise<number> {
  const fresh = records.filter(
    (record) => savedFingerprints.get(record.key) !== fingerprint(record),
  );
  if (fresh.length === 0 && !checkpoint) return 0;

  const chunks = chunkRecords(fresh);
  let saved = 0;

  for (let i = 0; i < chunks.length; i++) {
    const attached = i === chunks.length - 1 ? checkpoint : undefined;

    try {
      const result = await upsertConversations(chunks[i], attached);
      saved += result.conversationsSaved;
      remember(chunks[i]);
    } catch {
      saved += await saveIndividually(chunks[i], failures);
      if (attached) await upsertConversations([], attached);
    }
  }

  return saved;
}

async function saveIndividually(
  records: ConversationRecord[],
  failures: SyncFailure[],
): Promise<number> {
  let saved = 0;

  for (const record of records) {
    try {
      const result = await upsertConversations([record]);
      saved += result.conversationsSaved;
      remember([record]);
    } catch (error) {
      failures.push({ id: record.id, reason: toMessage(error) });
    }
  }

  return saved;
}

function chunkRecords(records: ConversationRecord[]): ConversationRecord[][] {
  const chunks: ConversationRecord[][] = [[]];
  let weight = 0;

  for (const record of records) {
    const recordWeight =
      RECORD_BASE_WEIGHT +
      record.messages.reduce((sum, message) => sum + message.content.length, 0);

    if (
      chunks[chunks.length - 1].length > 0 &&
      weight + recordWeight > MAX_CHUNK_WEIGHT
    ) {
      chunks.push([]);
      weight = 0;
    }
    chunks[chunks.length - 1].push(record);
    weight += recordWeight;
  }

  return chunks;
}

function remember(records: ConversationRecord[]): void {
  records.forEach((record) =>
    savedFingerprints.set(record.key, fingerprint(record)),
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
