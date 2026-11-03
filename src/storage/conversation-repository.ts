import type { AIProvider, ConversationRecord } from "../types/conversation";
import type {
  CheckpointCursor,
  ConversationDigest,
  SyncCheckpoint,
} from "../types/sync";
import { db } from "./database";
import type { StorageCounts, UpsertConversationsResult } from "./storage-messages";

export class ConversationRepository {
  async upsertMany(
    conversations: ConversationRecord[],
    checkpoint?: SyncCheckpoint,
  ): Promise<UpsertConversationsResult> {
    if (conversations.length === 0 && !checkpoint) {
      return {
        conversationsSaved: 0,
        messagesSaved: 0,
        conversationsUnchanged: 0,
        changedKeys: [],
      };
    }

    return db.transaction("rw", db.records, db.syncState, async () => {
      const stored = await db.records.bulkGet(conversations.map((c) => c.key));
      const changed = conversations.filter((c, i) => isChanged(stored[i], c));
      if (changed.length > 0) await db.records.bulkPut(changed);
      if (checkpoint) await advanceCheckpoint(checkpoint);

      return {
        conversationsSaved: changed.length,
        messagesSaved: changed.reduce((total, c) => total + c.messages.length, 0),
        conversationsUnchanged: conversations.length - changed.length,
        changedKeys: changed.map((c) => c.key),
      };
    });
  }

  getByKey(key: string): Promise<ConversationRecord | undefined> {
    return db.records.get(key);
  }

  getAll(): Promise<ConversationRecord[]> {
    return db.records.toArray();
  }

  async deleteByKey(key: string): Promise<void> {
    await db.records.delete(key);
  }

  getCounts(): Promise<StorageCounts> {
    return db.transaction("r", db.records, async () => {
      let messageCount = 0;
      await db.records.each((record) => {
        messageCount += record.messages.length;
      });
      return { conversationCount: await db.records.count(), messageCount };
    });
  }

  async getCheckpoint(key: string): Promise<SyncCheckpoint | null> {
    return (await db.syncState.get(key)) ?? null;
  }

  async clearCheckpoint(key: string): Promise<void> {
    await db.syncState.delete(key);
  }

  async listDigests(platform: AIProvider): Promise<ConversationDigest[]> {
    const records = await db.records.where("platform").equals(platform).toArray();
    return records.map((record) => ({
      id: record.id,
      messageCount: record.messages.length,
      deletedAtSource: record.deletedAtSource,
    }));
  }

  async markDeletedAtSource(
    platform: AIProvider,
    ids: string[],
    at: number,
  ): Promise<number> {
    return db.transaction("rw", db.records, async () => {
      const records = await db.records.bulkGet(
        ids.map((id) => `${platform}:${id}`),
      );
      const updated = records
        .filter((record): record is ConversationRecord => Boolean(record))
        .filter((record) => record.deletedAtSource === null)
        .map((record) => ({ ...record, deletedAtSource: at }));
      if (updated.length > 0) await db.records.bulkPut(updated);
      return updated.length;
    });
  }
}

function isChanged(
  stored: ConversationRecord | undefined,
  next: ConversationRecord,
): boolean {
  return (
    !stored ||
    stored.sourceSignature !== next.sourceSignature ||
    stored.updatedAt !== next.updatedAt ||
    stored.deletedAtSource !== null
  );
}

async function advanceCheckpoint(next: SyncCheckpoint): Promise<void> {
  const current = await db.syncState.get(next.key);
  if (!current || isAhead(next.cursor, current.cursor)) {
    await db.syncState.put(next);
  }
}

function isAhead(next: CheckpointCursor, current: CheckpointCursor): boolean {
  if (next.indexKey !== current.indexKey) return next.indexKey > current.indexKey;
  return next.primaryKey > current.primaryKey;
}
