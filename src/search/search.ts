import type {
  AIProvider,
  ConversationRecord,
  MessageRole,
  StoredMessage,
} from "../types/conversation";

export interface SearchFilters {
  providers: AIProvider[];
  roles: MessageRole[];
  from: number | null;
  to: number | null;
}

export interface MessageMatch {
  message: StoredMessage;
  snippet: string;
}

export interface ConversationSearchResult {
  conversation: ConversationRecord;
  matches: MessageMatch[];
  score: number;
}

export interface ProviderSearchGroup {
  provider: AIProvider;
  results: ConversationSearchResult[];
  matchingMessages: number;
}

export interface SearchResult {
  query: string;
  totalConversations: number;
  totalMessages: number;
  conversations: ConversationSearchResult[];
  groups: ProviderSearchGroup[];
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  providers: [],
  roles: [],
  from: null,
  to: null,
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function makeSnippet(content: string, query: string): string {
  const source = content.replace(/\s+/g, " ").trim();
  const index = normalize(source).indexOf(normalize(query));
  if (index < 0 || source.length <= 140) return source;

  const start = Math.max(0, index - 55);
  const end = Math.min(source.length, index + query.length + 75);
  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
}

function matchesFilters(
  conversation: ConversationRecord,
  message: StoredMessage,
  filters: SearchFilters,
): boolean {
  const providerMatches =
    filters.providers.length === 0 ||
    filters.providers.includes(conversation.platform);
  const roleMatches =
    filters.roles.length === 0 || filters.roles.includes(message.role);
  const timestamp = message.createdAt ?? conversation.updatedAt;
  const fromMatches = filters.from === null || (timestamp ?? 0) >= filters.from;
  const toMatches = filters.to === null || (timestamp ?? 0) <= filters.to;
  return providerMatches && roleMatches && fromMatches && toMatches;
}

export function searchConversations(
  records: ConversationRecord[],
  query: string,
  filters: SearchFilters = DEFAULT_SEARCH_FILTERS,
): SearchResult {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return {
      query,
      totalConversations: 0,
      totalMessages: 0,
      conversations: [],
      groups: [],
    };
  }

  const conversations = records
    .map((conversation): ConversationSearchResult | null => {
      const titleMatch = normalize(conversation.title).includes(normalizedQuery);
      const matches = conversation.messages
        .filter(
          (message) =>
            matchesFilters(conversation, message, filters) &&
            normalize(message.content).includes(normalizedQuery),
        )
        .map((message) => ({
          message,
          snippet: makeSnippet(message.content, normalizedQuery),
        }));

      if (!titleMatch && matches.length === 0) return null;
      return {
        conversation,
        matches,
        score: matches.length * 10 + (titleMatch ? 5 : 0),
      };
    })
    .filter((result): result is ConversationSearchResult => result !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.conversation.updatedAt ?? 0) - (left.conversation.updatedAt ?? 0),
    );

  const groupMap = new Map<AIProvider, ProviderSearchGroup>();
  for (const result of conversations) {
    const existing = groupMap.get(result.conversation.platform);
    if (existing) {
      existing.results.push(result);
      existing.matchingMessages += result.matches.length;
    } else {
      groupMap.set(result.conversation.platform, {
        provider: result.conversation.platform,
        results: [result],
        matchingMessages: result.matches.length,
      });
    }
  }

  const groups = [...groupMap.values()].sort(
    (left, right) =>
      right.matchingMessages - left.matchingMessages ||
      right.results.length - left.results.length,
  );

  return {
    query,
    totalConversations: conversations.length,
    totalMessages: conversations.reduce(
      (total, result) => total + result.matches.length,
      0,
    ),
    conversations,
    groups,
  };
}
