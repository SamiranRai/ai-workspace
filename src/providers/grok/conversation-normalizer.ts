import type {
  AIProvider,
  ConversationRecord,
  MessageRole,
  StoredMessage,
} from "../../types/conversation";

type DataRecord = Record<string, unknown>;

const PLATFORM: AIProvider = "grok";
const DEFAULT_ACCOUNT_SCOPE = "default";
const UNTITLED = "Untitled conversation";
const CONVERSATION_URL_PREFIX = "https://grok.com/chat/";

// Values below this are Unix seconds; larger values are milliseconds.
const SECONDS_CUTOFF = 100_000_000_000;

const ROLE_MAP: Readonly<Record<string, MessageRole>> = {
  user: "user",
  human: "user",
  assistant: "assistant",
  system: "system",
  tool: "tool",
};

export function normalizeGrokConversation(
  value: unknown,
  syncedAt: number = Date.now(),
): ConversationRecord {
  const source = asRecord(value, "Grok conversation");
  const id = requiredString(source.id, "conversation.id");

  if (source.messages !== undefined && !Array.isArray(source.messages)) {
    throw new Error(`conversation ${id}: messages must be an array.`);
  }

  const messages = (source.messages ?? []).map(
    (message: unknown, index: number) => normalizeMessage(message, id, index),
  );

  const accountScope =
    optionalString(source.account_id) ??
    optionalString(source.accountId) ??
    DEFAULT_ACCOUNT_SCOPE;

  const title = optionalString(source.title)?.trim() || UNTITLED;

  const isArchived = source.is_archived === true || source.isArchived === true;

  return {
    key: `${PLATFORM}:${accountScope}:${id}`,
    id,
    platform: PLATFORM,
    accountScope,
    title,
    url: `${CONVERSATION_URL_PREFIX}${encodeURIComponent(id)}`,
    createdAt: toTimestamp(source.create_time ?? source.createTime),
    updatedAt: toTimestamp(source.update_time ?? source.updateTime),
    isArchived,
    messages,
    sourceSignature: createSignature(title, isArchived, messages),
    lastSyncedAt: syncedAt,
    deletedAtSource: null,
  };
}

function normalizeMessage(
  value: unknown,
  conversationId: string,
  position: number,
): StoredMessage {
  const label = `conversation ${conversationId}, message #${position}`;
  const source = asRecord(value, label);

  const rawRole = optionalString(source.role)?.toLowerCase() ?? "";

  return {
    id: optionalString(source.id) ?? `${conversationId}:message:${position}`,
    position,
    role: ROLE_MAP[rawRole] ?? "other",
    content:
      optionalString(source.content) ?? optionalString(source.contentRaw) ?? "",
    createdAt: toTimestamp(source.createTime ?? source.create_time),
  };
}

/**
 * Converts a timestamp to epoch milliseconds.
 * Returns null when the value is missing or invalid.
 */
function toTimestamp(value: unknown): number | null {
  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value < SECONDS_CUTOFF ? Math.round(value * 1000) : value;
}

/**
 * Creates a content signature for change detection.
 * This is a non-cryptographic hash, not a security mechanism.
 */
function createSignature(
  title: string,
  isArchived: boolean,
  messages: StoredMessage[],
): string {
  const content = JSON.stringify([
    title,
    isArchived,
    messages.map((message) => [
      message.id,
      message.role,
      message.createdAt,
      message.content,
    ]),
  ]);

  return hashString(content);
}

/** Fast 53-bit non-cryptographic hash (cyrb53). */
function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);

    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);

  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function asRecord(value: unknown, label: string): DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected an object.`);
  }

  return value as DataRecord;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing or invalid required field: ${field}`);
  }

  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
