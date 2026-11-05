export interface SyncCheckpoint {
  key: string; // the platform, e.g. "chatgpt"
  cursor: string; // opaque: only that provider's source understands it
  checkedAt: number; // epoch ms of the last run that completed
}
