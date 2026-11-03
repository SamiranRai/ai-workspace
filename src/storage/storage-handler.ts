import { browser } from "wxt/browser";

import { ConversationRepository } from "./conversation-repository";
import {
  isAIProvider,
  isConversationRecordList,
  isRecord,
  isStringList,
  isSyncCheckpoint,
  isNonEmptyString,
} from "./conversation-validator";
import {
  CLEAR_SYNC_CHECKPOINT_MESSAGE,
  GET_CONVERSATIONS_MESSAGE,
  GET_STORAGE_COUNTS_MESSAGE,
  GET_SYNC_CHECKPOINT_MESSAGE,
  LIST_CONVERSATION_DIGESTS_MESSAGE,
  MARK_DELETED_AT_SOURCE_MESSAGE,
  UPSERT_CONVERSATIONS_MESSAGE,
  type StorageFailure,
  type StorageResponse,
} from "./storage-messages";

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
  CLEAR_SYNC_CHECKPOINT_MESSAGE,
  LIST_CONVERSATION_DIGESTS_MESSAGE,
  MARK_DELETED_AT_SOURCE_MESSAGE,
]);

const repository = new ConversationRepository();

export function isStorageMessage(
  message: unknown,
): message is Record<string, unknown> {
  return isRecord(message) && STORAGE_MESSAGE_TYPES.has(message.type);
}

export async function handleStorageMessage(
  message: Record<string, unknown>,
  senderUrl: string | undefined,
): Promise<StorageResponse> {
  if (!isAllowedSender(senderUrl)) {
    return failure(
      "Storage requests are only accepted from supported AI pages or extension pages.",
    );
  }

  const { type, conversations, checkpoint, key, platform, ids, at } = message;
  try {
    switch (type) {
      case UPSERT_CONVERSATIONS_MESSAGE:
        if (!isConversationRecordList(conversations) ||
            (checkpoint !== undefined && !isSyncCheckpoint(checkpoint))) {
          return failure("Invalid conversations payload.");
        }
        return { ok: true, ...(await repository.upsertMany(conversations, checkpoint)) };
      case GET_STORAGE_COUNTS_MESSAGE:
        return { ok: true, ...(await repository.getCounts()) };
      case GET_CONVERSATIONS_MESSAGE:
        return { ok: true, conversations: await repository.getAll() };
      case GET_SYNC_CHECKPOINT_MESSAGE:
        if (!isNonEmptyString(key)) return failure("Invalid checkpoint key.");
        return { ok: true, checkpoint: await repository.getCheckpoint(key) };
      case CLEAR_SYNC_CHECKPOINT_MESSAGE:
        if (!isNonEmptyString(key)) return failure("Invalid checkpoint key.");
        await repository.clearCheckpoint(key);
        return { ok: true };
      case LIST_CONVERSATION_DIGESTS_MESSAGE:
        if (!isAIProvider(platform)) return failure("Invalid platform.");
        return { ok: true, digests: await repository.listDigests(platform) };
      case MARK_DELETED_AT_SOURCE_MESSAGE:
        if (!isAIProvider(platform) || !isStringList(ids) || !isFiniteNumber(at)) {
          return failure("Invalid deletion payload.");
        }
        return { ok: true, marked: await repository.markDeletedAtSource(platform, ids, at) };
      default:
        return failure("Unsupported storage message.");
    }
  } catch (error) {
    console.error("[storage] Request failed", { type, error });
    return failure(error instanceof Error ? error.message : "Unknown storage error.");
  }
}

function isAllowedSender(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const origin = new URL(url).origin;
    if (ALLOWED_PAGE_ORIGINS.has(origin)) return true;
    return origin === new URL(browser.runtime.getURL("")).origin;
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function failure(error: string): StorageFailure {
  return { ok: false, error };
}
