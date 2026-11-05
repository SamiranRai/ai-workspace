import type { AIProvider } from "../types/conversation";

export const SYNC_NOW_MESSAGE = "smart-folder:sync-now";
export const REQUEST_SYNC_NOW_MESSAGE = "smart-folder:request-sync-now";

export interface SyncNowMessage {
  type: typeof SYNC_NOW_MESSAGE;
  platform?: AIProvider;
}

function hasType(value: unknown, type: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === type
  );
}

export function isSyncNowMessage(value: unknown): value is SyncNowMessage {
  return hasType(value, SYNC_NOW_MESSAGE);
}

export function isRequestSyncNowMessage(value: unknown): boolean {
  return hasType(value, REQUEST_SYNC_NOW_MESSAGE);
}
