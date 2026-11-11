import type { ConversationRecord } from "../shared/models/conversation";
import type { SyncCheckpoint } from "../shared/models/sync";
import { db } from "./database";
import type {
  StorageCounts,
  UpsertConversationsResult,
} from "./storage-messages";

export class ConversationRepository {
  /**
   * Inserts or replaces the conversations that actually changed and, in the SAME
   * transaction, saves the sync bookmark. Either both happen or neither does.
   */
  async upsertMany(
    conversations: ConversationRecord[],
    checkpoint?: SyncCheckpoint,
  ): Promise<UpsertConversationsResult> {
    if (conversations.length === 0 && !checkpoint) {
      return { conversationsSaved: 0, messagesSaved: 0, conversationsUnchanged: 0 };
    }

    return db.transaction("rw", db.records, db.syncState, async () => {
      const stored = await db.records.bulkGet(conversations.map((c) => c.key));
      const changed = conversations.filter((c, i) => isChanged(stored[i], c));

      if (changed.length > 0) await db.records.bulkPut(changed);
      if (checkpoint) await db.syncState.put(checkpoint);

      return {
        conversationsSaved: changed.length,
        messagesSaved: changed.reduce(
          (total, conversation) => total + conversation.messages.length,
          0,
        ),
        conversationsUnchanged: conversations.length - changed.length,
      };
    });
  }

  async getCheckpoint(key: string): Promise<SyncCheckpoint | null> {
    return (await db.syncState.get(key)) ?? null;
  }

  getByKey(key: string): Promise<ConversationRecord | undefined> {
    return db.records.get(key);
  }

  getAll(): Promise<ConversationRecord[]> {
    return db.records.toArray();
  }

  /** Diagnostic: streams every record to count nested messages, so it is O(all data). */
  getCounts(): Promise<StorageCounts> {
    return db.transaction("r", db.records, async () => {
      let messageCount = 0;

      await db.records.each((record) => {
        messageCount += record.messages.length;
      });

      return { conversationCount: await db.records.count(), messageCount };
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
    stored.updatedAt !== next.updatedAt
  );
}
