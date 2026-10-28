import type {
  AIProvider,
  ConversationRecord,
  MessageRole,
  StoredMessage,
} from "../../types/conversation";

type DataRecord = Record<string, unknown>;

const PLATFORM: AIProvider = "claude";
const DEFAULT_ACCOUNT_SCOPE = "default";
const UNTITLED = "Untitled conversation";
const CONVERSATION_URL_PREFIX = "https://claude.ai/chat/";
const SECONDS_CUTOFF = 100_000_000_000;

const ROLE_MAP: Readonly<Record<string, MessageRole>> = {
  human: "user",
  user: "user",
  assistant: "assistant",
  system: "system",
  tool: "tool",
};

export function normalizeClaudeConversation(
  value: unknown,
  syncedAt: number = Date.now(),
): ConversationRecord {
  const source = asRecord(value, "Claude conversation");
  const id = requiredString(source.id, "conversation.id");

  if (source.messages !== undefined && !Array.isArray(source.messages)) {
    throw new Error(`conversation ${id}: messages must be an array.`);
  }

  const messages = (source.messages ?? []).map(
    (message: unknown, index: number) => normalizeMessage(message, id, index),
  );

  const accountScope =
    optionalString(source.account_id) ?? DEFAULT_ACCOUNT_SCOPE;
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

  // Claude's local history uses `human`; the app's shared model uses `user`.
  const role = ROLE_MAP[rawRole] ?? "other";
  const content =
    optionalString(source.content) ?? optionalString(source.contentRaw) ?? "";

  return {
    id: optionalString(source.id) || `${conversationId}:message:${position}`,
    position,
    role,
    content,
    createdAt: toTimestamp(source.createTime ?? source.create_time),
  };
}

/** Return epoch milliseconds, or null when the source value is missing or invalid. */
function toTimestamp(value: unknown): number | null {
  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return null;
  return value < SECONDS_CUTOFF ? Math.round(value * 1000) : value;
}

/** Hash content-bearing fields so unchanged conversations can be detected. */
function createSignature(
  title: string,
  isArchived: boolean,
  messages: StoredMessage[],
): string {
  return hashString(
    JSON.stringify([
      title,
      isArchived,
      messages.map((message) => [
        message.id,
        message.role,
        message.createdAt,
        message.content,
      ]),
    ]),
  );
}

// cyrb53: fast non-cryptographic hash for local change detection, not security.
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
