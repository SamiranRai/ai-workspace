import type { ProviderSource, SourceEntry } from "../../sync/provider-source";
import { normalizeGeminiConversation } from "./conversation-normalizer";
import {
  GeminiSourceReader,
  type SourceCursor,
  type SourceRecord,
} from "./source-reader";

export function createGeminiSource(): ProviderSource {
  const reader = new GeminiSourceReader();

  return {
    platform: "gemini",
    overlap: 10,
    open: async () => {
      await reader.open();
    },
    close: () => reader.close(),
    head: async (signal) => {
      const head = await reader.readHead(signal);
      return head ? encodeCursor(head) : null;
    },
    changedSince: async (cursor, limit, signal) => {
      const batch = await reader.readConversationBatch({
        after: cursor ? decodeCursor(cursor) : null,
        limit,
        signal,
      });
      return {
        entries: batch.records.map(toEntry),
        next: batch.nextCursor ? encodeCursor(batch.nextCursor) : null,
        done: batch.done,
      };
    },
    newest: async (limit, signal) =>
      (await reader.readNewest(limit, signal)).map(toEntry),
    load: async (ids) =>
      ids.map((id) => ({ id, raw: entriesById.get(id)?.meta ?? null })),
    normalize: normalizeGeminiConversation,
    isIncomplete: () => false,
  };
}

const entriesById = new Map<string, SourceEntry>();

function toEntry(record: SourceRecord): SourceEntry {
  if (typeof record.primaryKey !== "string") {
    throw new Error("Unexpected non-string Gemini conversation ID.");
  }
  const entry = { id: record.primaryKey, meta: record.value };
  entriesById.set(entry.id, entry);
  return entry;
}

function encodeCursor(cursor: SourceCursor): string {
  return JSON.stringify([cursor.indexKey, cursor.primaryKey]);
}

function decodeCursor(value: string): SourceCursor | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 2) {
      return { indexKey: parsed[0] as IDBValidKey, primaryKey: parsed[1] as IDBValidKey };
    }
  } catch {
    // Treat a corrupted bookmark as a full rescan.
  }
  return null;
}
