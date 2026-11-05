import { browser } from "wxt/browser";

import { ConversationRepository } from "../src/storage/conversation-repository";

import {
  isAIProvider as _unusedGuardKeepAlive,
  isConversationRecordList,
  isNonEmptyString,
  isRecord,
  isSyncCheckpoint,
} from "../src/storage/conversation-validator";

import {
  GET_CONVERSATIONS_MESSAGE,
  GET_STORAGE_COUNTS_MESSAGE,
  GET_SYNC_CHECKPOINT_MESSAGE,
  UPSERT_CONVERSATIONS_MESSAGE,
  type StorageFailure,
  type StorageResponse,
} from "../src/storage/storage-messages";

import { registerSyncCoordinator } from "../src/sync/sync-coordinator";

void _unusedGuardKeepAlive;

// AI provider origins allowed to access shared conversation storage.
const ALLOWED_PAGE_ORIGINS: ReadonlySet<string> = new Set([
  "https://chatgpt.com",
  "https://claude.ai",
  "https://grok.com",
  "https://gemini.google.com",
]);

const STORAGE_MESSAGE_TYPES: ReadonlySet<unknown> = new Set([
  UPSERT_CONVERSATIONS_MESSAGE,
  GET_STORAGE_COUNTS_MESSAGE,
  GET_CONVERSATIONS_MESSAGE,
  GET_SYNC_CHECKPOINT_MESSAGE,
]);

const repository = new ConversationRepository();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Leave unrelated extension messages to their own handlers.
    if (!isStorageMessage(message)) return;

    // Handle the request asynchronously and keep the response channel open.
    void handleStorageMessage(message, sender.url)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error("[storage] Unexpected message handler failure", error);

        sendResponse(
          failure(
            error instanceof Error ? error.message : "Unknown storage error.",
          ),
        );
      });

    return true;
  });

  // Started AFTER storage is wired, and isolated, so a missing permission can't break storage.
  try {
    registerSyncCoordinator();
  } catch (error) {
    console.error("[smart-folder] sync coordinator failed to start", error);
  }
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
  if (!isAllowedSender(senderUrl)) {
    return failure(
      "Storage requests are only accepted from supported AI pages or extension pages.",
    );
  }

  const { type, conversations, checkpoint, key } = message;

  try {
    switch (type) {
      case UPSERT_CONVERSATIONS_MESSAGE: {
        if (!isConversationRecordList(conversations)) {
          return failure("Invalid conversations payload.");
        }

        const validCheckpoint =
          checkpoint === undefined
            ? undefined
            : isSyncCheckpoint(checkpoint)
              ? checkpoint
              : null;
        if (validCheckpoint === null) {
          return failure("Invalid checkpoint payload.");
        }

        const result = await repository.upsertMany(
          conversations,
          validCheckpoint,
        );

        return {
          ok: true,
          ...result,
        };
      }

      case GET_SYNC_CHECKPOINT_MESSAGE: {
        if (!isNonEmptyString(key)) {
          return failure("Invalid checkpoint key.");
        }

        return {
          ok: true,
          checkpoint: await repository.getCheckpoint(key),
        };
      }

      case GET_STORAGE_COUNTS_MESSAGE: {
        const counts = await repository.getCounts();

        return {
          ok: true,
          ...counts,
        };
      }

      case GET_CONVERSATIONS_MESSAGE: {
        const allConversations = await repository.getAll();

        return {
          ok: true,
          conversations: allConversations,
        };
      }

      default:
        return failure("Unsupported storage message.");
    }
  } catch (error) {
    console.error("[storage] Request failed", {
      type,
      error,
    });

    return failure(
      error instanceof Error ? error.message : "Unknown storage error.",
    );
  }
}

function isAllowedSender(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const origin = new URL(url).origin;

    // Allow only explicitly supported AI provider origins.
    if (ALLOWED_PAGE_ORIGINS.has(origin)) {
      return true;
    }

    // Allow pages belonging to this browser extension.
    const extensionOrigin = new URL(browser.runtime.getURL("")).origin;

    return origin === extensionOrigin;
  } catch {
    return false;
  }
}

function failure(error: string): StorageFailure {
  return {
    ok: false,
    error,
  };
}
