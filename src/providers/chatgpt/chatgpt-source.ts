import type { ProviderSource, SourceEntry } from "../provider-source";
import {
  normalizeChatGPTConversation,
  toTimestamp,
} from "./conversation-normalizer";
import {
  ChatGPTSourceReader,
  type SourceCursor,
  type SourceRecord,
} from "./source-reader";

const IN_FLIGHT_MS = 120_000;

export function createChatGPTSource(): ProviderSource {
  const reader = new ChatGPTSourceReader();

  return {
    platform: "chatgpt",

    open: async () => {
      await reader.open();
    },

    close: () => reader.close(),

    head: async (signal) => {
      const head = await reader.readHead(signal);
      return head ? encodeCursor(head) : null;
    },

    changedSince: async (cursor, limit, signal) => {
      const batch = await reader.readMetadataBatch({
        after: cursor ? decodeCursor(cursor) : null,
        limit,
        signal,
      });
      const next =
        batch.records.length > 0 && batch.nextCursor
          ? encodeCursor(batch.nextCursor)
          : null;

      return { entries: batch.records.map(toEntry), next, done: batch.done };
    },

    newest: async (limit, signal) =>
      (await reader.readNewestMetadata(limit, signal)).map(toEntry),

    load: async (ids, signal) =>
      (await reader.getConversationsByIds(ids, signal)).map(
        ({ requestedId, record }) => ({ id: requestedId, raw: record }),
      ),

    normalize: normalizeChatGPTConversation,

    isIncomplete,
  };
}

/** Only recently updated chats can be mid-write; old chats are never "incomplete". */
function isIncomplete(raw: unknown, meta: unknown, now: number): boolean {
  const info = meta as {
    update_time?: unknown;
    message_count?: unknown;
  } | null;
  const updatedAt = toTimestamp(info?.update_time);

  if (updatedAt === null || now - updatedAt > IN_FLIGHT_MS) return false;
  if (raw === null) return true;

  const messages = (raw as { messages?: unknown }).messages;
  return (
    typeof info?.message_count === "number" &&
    (!Array.isArray(messages) || messages.length !== info.message_count)
  );
}

function toEntry(record: SourceRecord): SourceEntry {
  if (typeof record.primaryKey !== "string") {
    throw new Error("Unexpected non-string conversation ID in metadata store.");
  }
  return { id: record.primaryKey, meta: record.value };
}

function encodeCursor(cursor: SourceCursor): string {
  if (
    typeof cursor.indexKey !== "string" ||
    typeof cursor.primaryKey !== "string"
  ) {
    throw new Error("Unexpected non-string cursor key in the metadata index.");
  }
  return JSON.stringify([cursor.indexKey, cursor.primaryKey]);
}

/** An unreadable cursor means "start from the beginning", which is always safe. */
function decodeCursor(value: string): SourceCursor | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    ) {
      return { indexKey: parsed[0], primaryKey: parsed[1] };
    }
  } catch {
    // fall through
  }
  return null;
}
