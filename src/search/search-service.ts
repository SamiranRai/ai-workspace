import { getConversations } from "../storage/storage-client";
import type {
  AIProvider,
  ConversationRecord,
  MessageRole,
} from "../shared/models/conversation";
import {
  searchConversationsAsync,
  type SearchResult,
} from "./search";

const SEARCH_RECORD_CACHE_MS = 10_000;

let cachedSearchRecords: {
  records: ConversationRecord[];
  loadedAt: number;
} | null = null;
let searchRecordsRequest: Promise<ConversationRecord[]> | null = null;

export interface StoredConversationSearchRequest {
  query: string;
  providers: readonly AIProvider[];
  roles: readonly MessageRole[];
  from: number | null;
  to: number | null;
  titlesOnly: boolean;
  signal: AbortSignal;
}

export async function searchStoredConversations({
  query,
  providers,
  roles,
  from,
  to,
  titlesOnly,
  signal,
}: StoredConversationSearchRequest): Promise<SearchResult> {
  if (signal.aborted) return emptySearchResult(query);

  const records = await getSearchRecords();
  if (signal.aborted) return emptySearchResult(query);

  return searchConversationsAsync(
    records,
    query,
    {
      providers: [...providers],
      roles: [...roles],
      from,
      to,
    },
    { titlesOnly },
    signal,
  );
}

async function getSearchRecords(): Promise<ConversationRecord[]> {
  const now = Date.now();
  if (
    cachedSearchRecords &&
    now - cachedSearchRecords.loadedAt < SEARCH_RECORD_CACHE_MS
  ) {
    return cachedSearchRecords.records;
  }

  if (!searchRecordsRequest) {
    searchRecordsRequest = getConversations()
      .then((records) => {
        cachedSearchRecords = { records, loadedAt: Date.now() };
        return records;
      })
      .finally(() => {
        searchRecordsRequest = null;
      });
  }

  return searchRecordsRequest;
}

function emptySearchResult(query: string): SearchResult {
  return {
    query,
    terms: [],
    totalConversations: 0,
    totalMessages: 0,
    elapsedMs: 0,
    conversations: [],
    groups: [],
  };
}
