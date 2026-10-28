import type { AIProvider } from "../../../types/conversation";

export type MessageRole = "user" | "assistant";

export interface MessageMatch {
  id: string;
  role: Exclude<MessageRole, "system" | "tool" | "other">;
  snippet: string;
  createdAt: string;
}

export interface ConversationMatch {
  id: string;
  provider: AIProvider;
  title: string;
  url?: string;
  updatedAt: string;
  messages: readonly MessageMatch[];
}

export interface SearchRequest {
  query: string;
  platforms: readonly AIProvider[];
  signal: AbortSignal;
}

export type SearchConversations = (
  request: SearchRequest,
) => Promise<readonly ConversationMatch[]>;

export type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; results: readonly ConversationMatch[] }
  | { status: "error"; message: string };

export interface SubmittedSearch {
  query: string;
}
