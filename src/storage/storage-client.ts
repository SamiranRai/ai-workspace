import { browser } from "wxt/browser";

import type { ConversationRecord } from "../shared/models/conversation";
import type { SyncCheckpoint } from "../shared/models/sync";
import {
  GET_CONVERSATIONS_MESSAGE,
  GET_SYNC_CHECKPOINT_MESSAGE,
  UPSERT_CONVERSATIONS_MESSAGE,
  type GetConversationsResponse,
  type GetSyncCheckpointResponse,
  type StorageRequest,
  type StorageResponse,
  type UpsertConversationsResponse,
  type UpsertConversationsResult,
} from "../shared/contracts/storage-messages";

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
  };
}

export async function getSyncCheckpoint(
  key: string,
): Promise<SyncCheckpoint | null> {
  const response = await send<GetSyncCheckpointResponse>({
    type: GET_SYNC_CHECKPOINT_MESSAGE,
    key,
  });

  if (!response.ok) {
    throw new Error(`Reading sync checkpoint failed: ${response.error}`);
  }
  return response.checkpoint;
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
