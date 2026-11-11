import Dexie, { type Table } from "dexie";

import type { ConversationRecord } from "../shared/models/conversation";
import type { SyncCheckpoint } from "../shared/models/sync";

const RECORD_INDEXES = "&key, platform, [platform+accountScope], updatedAt";

class AiWorkspaceDatabase extends Dexie {
  records!: Table<ConversationRecord, string>;
  syncState!: Table<SyncCheckpoint, string>;

  constructor() {
    super("AiWorkspaceDB");

    this.version(1).stores({ records: RECORD_INDEXES });

    // v2: adds the bookmark table and re-keys existing records to `platform:id`
    // (the old key also contained the account scope, which would create duplicates).
    this.version(2)
      .stores({ records: RECORD_INDEXES, syncState: "&key" })
      .upgrade(async (tx) => {
        const table = tx.table<ConversationRecord, string>("records");
        const all = await table.toArray();
        await table.clear();
        await table.bulkPut(
          all.map((record) => ({ ...record, key: `${record.platform}:${record.id}` })),
        );
      });
  }
}

export const db = new AiWorkspaceDatabase();
