import Dexie, { type Table } from "dexie";

import type { ConversationRecord } from "../types/conversation";
import type { SyncCheckpoint } from "../types/sync";

const RECORD_INDEXES = "&key, platform, [platform+accountScope], updatedAt";

class AiWorkspaceDatabase extends Dexie {
  records!: Table<ConversationRecord, string>;
  syncState!: Table<SyncCheckpoint, string>;

  constructor() {
    super("AiWorkspaceDB");

    this.version(1).stores({ records: RECORD_INDEXES });
    this.version(2)
      .stores({ records: RECORD_INDEXES, syncState: "&key" })
      .upgrade(async (tx) => {
        const table = tx.table<ConversationRecord, string>("records");
        const all = await table.toArray();
        await table.clear();
        const merged = new Map<string, ConversationRecord>();
        for (const record of all) {
          const next = {
            ...record,
            key: `${record.platform}:${record.id}`,
            deletedAtSource: record.deletedAtSource ?? null,
          };
          const current = merged.get(next.key);
          if (!current || next.lastSyncedAt >= current.lastSyncedAt) {
            merged.set(next.key, next);
          }
        }
        await table.bulkPut([...merged.values()]);
      });
  }
}

export const db = new AiWorkspaceDatabase();
