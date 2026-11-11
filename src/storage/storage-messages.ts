import type { ConversationRecord } from "../shared/models/conversation";
import type { SyncCheckpoint } from "../shared/models/sync";

export const UPSERT_CONVERSATIONS_MESSAGE = "storage:upsert-conversations";
export const GET_STORAGE_COUNTS_MESSAGE = "storage:get-counts";
export const GET_CONVERSATIONS_MESSAGE = "storage:get-conversations";
export const GET_SYNC_CHECKPOINT_MESSAGE = "storage:get-sync-checkpoint";

export interface UpsertConversationsRequest {
  type: typeof UPSERT_CONVERSATIONS_MESSAGE;
  conversations: ConversationRecord[];
  checkpoint?: SyncCheckpoint;
}

export interface GetStorageCountsRequest {
  type: typeof GET_STORAGE_COUNTS_MESSAGE;
}

export interface GetConversationsRequest {
  type: typeof GET_CONVERSATIONS_MESSAGE;
}

export interface GetSyncCheckpointRequest {
  type: typeof GET_SYNC_CHECKPOINT_MESSAGE;
  key: string;
}

export type StorageRequest =
  | UpsertConversationsRequest
  | GetStorageCountsRequest
  | GetConversationsRequest
  | GetSyncCheckpointRequest;

export interface UpsertConversationsResult {
  conversationsSaved: number;
  messagesSaved: number;
  conversationsUnchanged: number;
}

export interface StorageCounts {
  conversationCount: number;
  messageCount: number;
}

export interface StorageFailure {
  ok: false;
  error: string;
}

export type UpsertConversationsResponse =
  | ({ ok: true } & UpsertConversationsResult)
  | StorageFailure;

export type GetStorageCountsResponse =
  | ({ ok: true } & StorageCounts)
  | StorageFailure;

export type GetConversationsResponse =
  | { ok: true; conversations: ConversationRecord[] }
  | StorageFailure;

export type GetSyncCheckpointResponse =
  | { ok: true; checkpoint: SyncCheckpoint | null }
  | StorageFailure;

export type StorageResponse =
  | UpsertConversationsResponse
  | GetStorageCountsResponse
  | GetConversationsResponse
  | GetSyncCheckpointResponse;
