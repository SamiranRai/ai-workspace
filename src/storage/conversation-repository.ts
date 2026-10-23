import type { ConversationRecord } from "../types/conversation";
import { db } from "./database";
import type {
  StorageCounts,
  UpsertConversationsResult,
} from "./storage-messages";

export class ConversationRepository {
  /** Inserts or fully replaces each conversation by key, all-or-nothing. */
  async upsertMany(
    conversations: ConversationRecord[],
  ): Promise<UpsertConversationsResult> {
    if (conversations.length === 0) {
      return { conversationsSaved: 0, messagesSaved: 0 };
    }

    await db.transaction("rw", db.records, () =>
      db.records.bulkPut(conversations),
    );

    return {
      conversationsSaved: conversations.length,
      messagesSaved: conversations.reduce(
        (total, conversation) => total + conversation.messages.length,
        0,
      ),
    };
  }

  getByKey(key: string): Promise<ConversationRecord | undefined> {
    return db.records.get(key);
  }

  async deleteByKey(key: string): Promise<void> {
    await db.records.delete(key);
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
