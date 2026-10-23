import Dexie, { type Table } from "dexie";

import type { ConversationRecord } from "../types/conversation";

class AiWorkspaceDatabase extends Dexie {
  records!: Table<ConversationRecord, string>;

  constructor() {
    super("AiWorkspaceDB");

    this.version(1).stores({
      records: "&key, platform, [platform+accountScope], updatedAt",
    });
  }
}

export const db = new AiWorkspaceDatabase();
