import type { AIProvider, ConversationRecord } from "../types/conversation";
import type { ConversationDigest, SyncCheckpoint } from "../types/sync";

export const UPSERT_CONVERSATIONS_MESSAGE = "storage:upsert-conversations";
export const GET_STORAGE_COUNTS_MESSAGE = "storage:get-counts";
export const GET_CONVERSATIONS_MESSAGE = "storage:get-conversations";
export const GET_SYNC_CHECKPOINT_MESSAGE = "storage:get-sync-checkpoint";
export const CLEAR_SYNC_CHECKPOINT_MESSAGE = "storage:clear-sync-checkpoint";
export const LIST_CONVERSATION_DIGESTS_MESSAGE = "storage:list-conversation-digests";
export const MARK_DELETED_AT_SOURCE_MESSAGE = "storage:mark-deleted-at-source";

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
export interface ClearSyncCheckpointRequest {
  type: typeof CLEAR_SYNC_CHECKPOINT_MESSAGE;
  key: string;
}
export interface ListConversationDigestsRequest {
  type: typeof LIST_CONVERSATION_DIGESTS_MESSAGE;
  platform: AIProvider;
}
export interface MarkDeletedAtSourceRequest {
  type: typeof MARK_DELETED_AT_SOURCE_MESSAGE;
  platform: AIProvider;
  ids: string[];
  at: number;
}

export type StorageRequest =
  | UpsertConversationsRequest
  | GetStorageCountsRequest
  | GetConversationsRequest
  | GetSyncCheckpointRequest
  | ClearSyncCheckpointRequest
  | ListConversationDigestsRequest
  | MarkDeletedAtSourceRequest;

export interface UpsertConversationsResult {
  conversationsSaved: number;
  messagesSaved: number;
  conversationsUnchanged: number;
  changedKeys: string[];
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
  | ({ ok: true; conversations: ConversationRecord[] })
  | StorageFailure;
export type GetSyncCheckpointResponse =
  | { ok: true; checkpoint: SyncCheckpoint | null }
  | StorageFailure;
export type ClearSyncCheckpointResponse = { ok: true } | StorageFailure;
export type ListConversationDigestsResponse =
  | { ok: true; digests: ConversationDigest[] }
  | StorageFailure;
export type MarkDeletedAtSourceResponse =
  | { ok: true; marked: number }
  | StorageFailure;

export type StorageResponse =
  | UpsertConversationsResponse
  | GetStorageCountsResponse
  | GetConversationsResponse
  | GetSyncCheckpointResponse
  | ClearSyncCheckpointResponse
  | ListConversationDigestsResponse
  | MarkDeletedAtSourceResponse;
