import type { ProviderSource, SourceEntry } from "../provider-source";
import { normalizeGeminiConversation } from "./conversation-normalizer";
import {
  GeminiSourceReader,
  type SourceCursor,
  type SourceRecord,
} from "./source-reader";

export function createGeminiSource(): ProviderSource {
  const reader = new GeminiSourceReader();
  const entriesById = new Map<string, SourceEntry>();

  return {
    platform: "gemini",
    overlap: 10,
    open: async () => {
      await reader.open();
    },
    close: () => {
      entriesById.clear();
      reader.close();
    },
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
        entries: batch.records.map((record) => toEntry(record, entriesById)),
        next: batch.nextCursor ? encodeCursor(batch.nextCursor) : null,
        done: batch.done,
      };
    },
    newest: async (limit, signal) =>
      (await reader.readNewest(limit, signal)).map((record) =>
        toEntry(record, entriesById),
      ),
    load: async (ids) =>
      ids.map((id) => ({ id, raw: entriesById.get(id)?.meta ?? null })),
    normalize: normalizeGeminiConversation,
    isIncomplete: () => false,
  };
}

function toEntry(
  record: SourceRecord,
  entriesById: Map<string, SourceEntry>,
): SourceEntry {
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
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      isCursorIndexKey(parsed[0]) &&
      typeof parsed[1] === "string" &&
      parsed[1] !== ""
    ) {
      return { indexKey: parsed[0], primaryKey: parsed[1] };
    }
  } catch {
    // Treat a corrupted bookmark as a full rescan.
  }
  return null;
}

function isCursorIndexKey(value: unknown): value is string | number {
  return (
    (typeof value === "string" && value !== "") ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
