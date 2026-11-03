import {
  AI_PROVIDERS,
  MESSAGE_ROLES,
  type AIProvider,
  type ConversationRecord,
  type StoredMessage,
} from "../types/conversation";
import type { SyncCheckpoint } from "../types/sync";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAIProvider(value: unknown): value is AIProvider {
  return isOneOf(AI_PROVIDERS, value);
}

export function isConversationRecordList(
  value: unknown,
): value is ConversationRecord[] {
  return Array.isArray(value) && value.every(isConversationRecord);
}

function isConversationRecord(value: unknown): value is ConversationRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.id) &&
    isAIProvider(value.platform) &&
    isNonEmptyString(value.accountScope) &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    isTimestampOrNull(value.createdAt) &&
    isTimestampOrNull(value.updatedAt) &&
    isTimestampOrNull(value.deletedAtSource) &&
    typeof value.isArchived === "boolean" &&
    Array.isArray(value.messages) &&
    value.messages.every(isStoredMessage) &&
    isNonEmptyString(value.sourceSignature) &&
    isFiniteNumber(value.lastSyncedAt)
  );
}

function isStoredMessage(value: unknown): value is StoredMessage {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    Number.isInteger(value.position) &&
    isOneOf(MESSAGE_ROLES, value.role) &&
    typeof value.content === "string" &&
    isTimestampOrNull(value.createdAt)
  );
}

function isOneOf<T extends string>(
  options: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (options as readonly string[]).includes(value)
  );
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTimestampOrNull(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

export function isSyncCheckpoint(value: unknown): value is SyncCheckpoint {
  return (
    isRecord(value) &&
    isNonEmptyString(value.key) &&
    isRecord(value.cursor) &&
    isNonEmptyString(value.cursor.indexKey) &&
    isNonEmptyString(value.cursor.primaryKey) &&
    isFiniteNumber(value.checkedAt)
  );
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}
