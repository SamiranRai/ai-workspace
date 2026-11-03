// src/providers/chatgpt/conversation-normalizer.ts
import type {
  AIProvider,
  ConversationRecord,
  MessageRole,
  StoredMessage,
} from "../../types/conversation";

type DataRecord = Record<string, unknown>;

const PLATFORM: AIProvider = "chatgpt";
const DEFAULT_ACCOUNT_SCOPE = "default";
const UNTITLED = "Untitled conversation";
const CONVERSATION_URL_PREFIX = "https://chatgpt.com/c/";

// Values below this are Unix seconds, above it are milliseconds.
const SECONDS_CUTOFF = 100_000_000_000;

const KNOWN_ROLES: ReadonlySet<string> = new Set([
  "user",
  "assistant",
  "system",
  "tool",
]);

export function normalizeChatGPTConversation(
  value: unknown,
  syncedAt: number = Date.now(),
): ConversationRecord {
  const source = asRecord(value, "conversation");
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
  const isArchived = source.is_archived === true;

  return {
    key: `${PLATFORM}:${id}`,
    id,
    platform: PLATFORM,
    accountScope,
    title,
    url: `${CONVERSATION_URL_PREFIX}${encodeURIComponent(id)}`,
    createdAt: toTimestamp(source.create_time),
    updatedAt: toTimestamp(source.update_time),
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

  return {
    id: requiredString(source.id, `${label}: id`),
    position,
    role: toRole(source.role),
    content: optionalString(source.content) ?? "",
    createdAt: toTimestamp(source.createTime),
  };
}

function toRole(value: unknown): MessageRole {
  return typeof value === "string" && KNOWN_ROLES.has(value)
    ? (value as MessageRole)
    : "other";
}

/** Returns epoch milliseconds, or null when the value is missing or unusable. */
const ZONELESS_ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/;

export function toTimestamp(value: unknown): number | null {
  if (typeof value === "string") {
    const milliseconds = Date.parse(
      ZONELESS_ISO.test(value) ? `${value}Z` : value,
    );
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value < SECONDS_CUTOFF ? Math.round(value * 1000) : value;
}

/** Hashes stored content only, so metadata-only changes don't trigger a re-sync. */
function createSignature(
  title: string,
  isArchived: boolean,
  messages: StoredMessage[],
): string {
  return hashString(
    JSON.stringify([
      title,
      isArchived,
      messages.map((m) => [m.id, m.role, m.createdAt, m.content]),
    ]),
  );
}

// cyrb53: fast 53-bit non-cryptographic hash, enough for change detection.
function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
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
