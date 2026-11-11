import type { AIProvider, MessageRole as StoredMessageRole } from "../../../shared/models/conversation";
import type { TextSegment } from "../../../search/search";

export type MessageRole = "user" | "assistant";

export interface MessageMatch {
  id: string;
  role: Exclude<MessageRole, "system" | "tool" | "other">;
  snippet: string;
  createdAt: string;
  segments: readonly TextSegment[];
}

export interface ConversationMatch {
  id: string;
  provider: AIProvider;
  title: string;
  url?: string;
  updatedAt: string;
  messages: readonly MessageMatch[];
  titleMatch: boolean;
  titleSegments: readonly TextSegment[];
}

export interface SearchRequest {
  query: string;
  platforms: readonly AIProvider[];
  roles: readonly StoredMessageRole[];
  from: number | null;
  to: number | null;
  titlesOnly: boolean;
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
