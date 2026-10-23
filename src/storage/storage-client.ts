import { browser } from "wxt/browser";

import type { ConversationRecord } from "../types/conversation";
import {
  GET_STORAGE_COUNTS_MESSAGE,
  UPSERT_CONVERSATIONS_MESSAGE,
  type GetStorageCountsResponse,
  type StorageCounts,
  type StorageRequest,
  type StorageResponse,
  type UpsertConversationsResponse,
  type UpsertConversationsResult,
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
): Promise<UpsertConversationsResult> {
  const response = await send<UpsertConversationsResponse>({
    type: UPSERT_CONVERSATIONS_MESSAGE,
    conversations,
  });

  if (!response.ok) {
    throw new Error(`Saving conversations failed: ${response.error}`);
  }

  return {
    conversationsSaved: response.conversationsSaved,
    messagesSaved: response.messagesSaved,
  };
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
