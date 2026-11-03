export const AI_PROVIDERS = ["chatgpt", "claude", "gemini", "grok"] as const;
export const MESSAGE_ROLES = [
  "user",
  "assistant",
  "system",
  "tool",
  "other",
] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export interface StoredMessage {
  id: string;
  position: number;
  role: MessageRole;
  content: string;
  createdAt: number | null;
}

export interface ConversationRecord {
  // Unique across providers and accounts
  key: string;

  // Original provider conversation ID
  id: string;
  platform: AIProvider;
  accountScope: string;

  title: string;
  url: string;

  createdAt: number | null;
  updatedAt: number | null;
  isArchived: boolean;

  // Original messages, in conversation order
  messages: StoredMessage[];

  // Used to detect changes during synchronization
  sourceSignature: string;
  lastSyncedAt: number;
  deletedAtSource: number | null;
}
