export interface CheckpointCursor {
  indexKey: string;
  primaryKey: string;
}

export interface SyncCheckpoint {
  key: string;
  cursor: CheckpointCursor;
  checkedAt: number;
}

export interface ConversationDigest {
  id: string;
  messageCount: number;
  deletedAtSource: number | null;
}
