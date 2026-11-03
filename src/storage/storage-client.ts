import { browser } from "wxt/browser";

import type { AIProvider, ConversationRecord } from "../types/conversation";
import type { ConversationDigest, SyncCheckpoint } from "../types/sync";
import {
  GET_STORAGE_COUNTS_MESSAGE,
  GET_CONVERSATIONS_MESSAGE,
  UPSERT_CONVERSATIONS_MESSAGE,
  GET_SYNC_CHECKPOINT_MESSAGE,
  CLEAR_SYNC_CHECKPOINT_MESSAGE,
  LIST_CONVERSATION_DIGESTS_MESSAGE,
  MARK_DELETED_AT_SOURCE_MESSAGE,
  type GetStorageCountsResponse,
  type GetConversationsResponse,
  type StorageCounts,
  type StorageRequest,
  type StorageResponse,
  type UpsertConversationsResponse,
  type UpsertConversationsResult,
  type GetSyncCheckpointResponse,
  type ClearSyncCheckpointResponse,
  type ListConversationDigestsResponse,
  type MarkDeletedAtSourceResponse,
} from "./storage-messages";

async function send<T extends StorageResponse>(
  request: StorageRequest,
): Promise<T> {
  const response: T | undefined = await browser.runtime.sendMessage(request);

  if (!response) {
    throw new Error("The background script did not respond.");
  }
  return response;
}

export async function upsertConversations(
  conversations: ConversationRecord[],
  checkpoint?: SyncCheckpoint,
): Promise<UpsertConversationsResult> {
  const response = await send<UpsertConversationsResponse>({
    type: UPSERT_CONVERSATIONS_MESSAGE,
    conversations,
    checkpoint,
  });

  if (!response.ok) {
    throw new Error(`Saving conversations failed: ${response.error}`);
  }

  return {
    conversationsSaved: response.conversationsSaved,
    messagesSaved: response.messagesSaved,
    conversationsUnchanged: response.conversationsUnchanged,
    changedKeys: response.changedKeys,
  };
}

export async function getSyncCheckpoint(key: string): Promise<SyncCheckpoint | null> {
  const response = await send<GetSyncCheckpointResponse>({
    type: GET_SYNC_CHECKPOINT_MESSAGE,
    key,
  });
  if (!response.ok) throw new Error(`Reading sync checkpoint failed: ${response.error}`);
  return response.checkpoint;
}

export async function clearSyncCheckpoint(key: string): Promise<void> {
  const response = await send<ClearSyncCheckpointResponse>({
    type: CLEAR_SYNC_CHECKPOINT_MESSAGE,
    key,
  });
  if (!response.ok) throw new Error(`Clearing sync checkpoint failed: ${response.error}`);
}

export async function listConversationDigests(platform: AIProvider): Promise<ConversationDigest[]> {
  const response = await send<ListConversationDigestsResponse>({
    type: LIST_CONVERSATION_DIGESTS_MESSAGE,
    platform,
  });
  if (!response.ok) throw new Error(`Listing conversation digests failed: ${response.error}`);
  return response.digests;
}

export async function markDeletedAtSource(
  platform: AIProvider,
  ids: string[],
  at: number,
): Promise<number> {
  const response = await send<MarkDeletedAtSourceResponse>({
    type: MARK_DELETED_AT_SOURCE_MESSAGE,
    platform,
    ids,
    at,
  });
  if (!response.ok) throw new Error(`Marking deleted conversations failed: ${response.error}`);
  return response.marked;
}

export async function getStorageCounts(): Promise<StorageCounts> {
  const response = await send<GetStorageCountsResponse>({
    type: GET_STORAGE_COUNTS_MESSAGE,
  });

  if (!response.ok) {
    throw new Error(`Reading storage counts failed: ${response.error}`);
  }

  return {
    conversationCount: response.conversationCount,
    messageCount: response.messageCount,
  };
}

export async function getConversations(): Promise<ConversationRecord[]> {
  const response = await send<GetConversationsResponse>({
    type: GET_CONVERSATIONS_MESSAGE,
  });
  if (!response.ok) {
    throw new Error(`Reading conversations failed: ${response.error}`);
  }
  return response.conversations;
}
