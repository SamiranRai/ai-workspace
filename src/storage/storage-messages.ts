import type { ConversationRecord } from "../types/conversation";

export const UPSERT_CONVERSATIONS_MESSAGE = "storage:upsert-conversations";
export const GET_STORAGE_COUNTS_MESSAGE = "storage:get-counts";

export interface UpsertConversationsRequest {
  type: typeof UPSERT_CONVERSATIONS_MESSAGE;
  conversations: ConversationRecord[];
}

export interface GetStorageCountsRequest {
  type: typeof GET_STORAGE_COUNTS_MESSAGE;
}

export type StorageRequest =
  | UpsertConversationsRequest
  | GetStorageCountsRequest;

export interface UpsertConversationsResult {
  conversationsSaved: number;
  messagesSaved: number;
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

export type StorageResponse =
  | UpsertConversationsResponse
  | GetStorageCountsResponse;
