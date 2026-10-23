import { browser } from "wxt/browser";

import { ConversationRepository } from "../src/storage/conversation-repository";
import {
  isConversationRecordList,
  isRecord,
} from "../src/storage/conversation-validator";
import {
  GET_STORAGE_COUNTS_MESSAGE,
  UPSERT_CONVERSATIONS_MESSAGE,
  type StorageFailure,
  type StorageResponse,
} from "../src/storage/storage-messages";

const CHATGPT_ORIGIN = "https://chatgpt.com";
const STORAGE_MESSAGE_TYPES: ReadonlySet<unknown> = new Set([
  UPSERT_CONVERSATIONS_MESSAGE,
  GET_STORAGE_COUNTS_MESSAGE,
]);

const repository = new ConversationRepository();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Leave unrelated extension messages to their own handlers.
    if (!isStorageMessage(message)) return;

    void handleStorageMessage(message, sender.url).then(sendResponse);
    return true; // keeps the channel open for the async response
  });
});

function isStorageMessage(
  message: unknown,
): message is Record<string, unknown> {
  return isRecord(message) && STORAGE_MESSAGE_TYPES.has(message.type);
}

async function handleStorageMessage(
  message: Record<string, unknown>,
  senderUrl: string | undefined,
): Promise<StorageResponse> {
  if (!isChatGPTSender(senderUrl)) {
    return failure("Storage requests are only accepted from ChatGPT.");
  }

  const { type, conversations } = message;

  try {
    switch (type) {
      case UPSERT_CONVERSATIONS_MESSAGE:
        if (!isConversationRecordList(conversations)) {
          return failure("Invalid conversations payload.");
        }
        return { ok: true, ...(await repository.upsertMany(conversations)) };

      case GET_STORAGE_COUNTS_MESSAGE:
        return { ok: true, ...(await repository.getCounts()) };

      default:
        return failure("Unsupported storage message.");
    }
  } catch (error) {
    console.error("[storage] request failed", error);
    return failure(
      error instanceof Error ? error.message : "Unknown storage error.",
    );
  }
}

function isChatGPTSender(url: string | undefined): boolean {
  if (!url) return false;

  try {
    return new URL(url).origin === CHATGPT_ORIGIN;
  } catch {
    return false;
  }
}

function failure(error: string): StorageFailure {
  return { ok: false, error };
}
