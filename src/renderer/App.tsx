
import { useCallback, useEffect, useState } from "react";

import { searchConversationsAsync } from "../search/search";
import { getConversations } from "../storage/storage-client";
import type { AIProvider, ConversationRecord } from "../shared/models/conversation";
import { SearchPanel } from "./features/search";
import type {
  ConversationMatch,
  MessageMatch,
  SearchRequest,
} from "./features/search";
import { registerStyles } from "./shared/shadow-styles";
import css from "./App.css?inline";
import designSystemCss from "./shared/design-system/index.css?inline";

registerStyles(css, "base");
registerStyles(designSystemCss, "base");

const toIsoString = (timestamp: number | null, fallback = 0): string =>
  new Date(timestamp ?? fallback).toISOString();

const isSelectableRole = (
  role: string,
): role is MessageMatch["role"] => role === "user" || role === "assistant";

const SEARCH_RECORD_CACHE_MS = 10_000;
let cachedSearchRecords: {
  records: ConversationRecord[];
  loadedAt: number;
} | null = null;
let searchRecordsRequest: Promise<ConversationRecord[]> | null = null;

const getSearchRecords = async (): Promise<ConversationRecord[]> => {
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
};

const getOriginProvider = (): AIProvider => {
  const hostname = window.location.hostname;
  if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) return "claude";
  if (hostname === "grok.com" || hostname.endsWith(".grok.com")) return "grok";
  if (
    hostname === "gemini.google.com" ||
    hostname.endsWith(".gemini.google.com")
  ) {
    return "gemini";
  }
  return "chatgpt";
};

const search = async ({
  query,
  platforms,
  roles,
  from,
  to,
  titlesOnly,
  signal,
}: SearchRequest): Promise<readonly ConversationMatch[]> => {
  if (signal.aborted) return [];

  const records = await getSearchRecords();
  if (signal.aborted) return [];

  const result = await searchConversationsAsync(records, query, {
    providers: [...platforms],
    roles: [...roles],
    from,
    to,
  }, { titlesOnly }, signal);

  return result.conversations.map(({ conversation, matches, titleMatch, titleSegments }) => ({
    id: conversation.key,
    provider: conversation.platform,
    title: conversation.title,
    url: conversation.url,
    updatedAt: toIsoString(conversation.updatedAt, conversation.lastSyncedAt),
    titleMatch,
    titleSegments,
    messages: matches.flatMap(({ message, snippet, segments }) => {
      if (!isSelectableRole(message.role)) return [];

      return [
        {
          id: message.id,
          role: message.role,
          snippet,
          createdAt: toIsoString(
            message.createdAt,
            conversation.updatedAt ?? conversation.lastSyncedAt,
          ),
          segments,
        },
      ];
    }),
  }));
};

interface AppProps {
  initialOpen?: boolean;
}

const App = ({ initialOpen = false }: AppProps) => {
  const [isSearchOpen, setIsSearchOpen] = useState(initialOpen);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const originProvider = getOriginProvider();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isSearchOpen && event.key === "Escape") {
        event.preventDefault();
        setIsSearchOpen(false);
        return;
      }

      const hasCommandModifier = event.metaKey || event.ctrlKey;
      if (!hasCommandModifier) return;

      if (event.key.toLowerCase() === "x") {
        event.preventDefault();
        setIsSearchOpen(true);
      } else if (isSearchOpen && event.key.toLowerCase() === "c") {
        event.preventDefault();
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [isSearchOpen]);

  useEffect(() => {
    const host = document.getElementById("aiworkspace-root");
    if (!host) return;

    const handleOpenSearch = () => setIsSearchOpen(true);
    host.addEventListener("ai-workspace:open-search", handleOpenSearch);
    return () =>
      host.removeEventListener("ai-workspace:open-search", handleOpenSearch);
  }, []);

  const handleSelectMessage = useCallback(
    (conversation: ConversationMatch, _message: MessageMatch) => {
      if (conversation.url) window.open(conversation.url, "_blank", "noopener");
    },
    [],
  );

  if (isSearchOpen) {
    return (
      <div className="app-overlay" onClick={() => setIsSearchOpen(false)}>
        <SearchPanel
          searchConversations={search}
          onClose={() => setIsSearchOpen(false)}
          onSelectMessage={handleSelectMessage}
          initialPlatforms={[originProvider]}
          originPlatform={originProvider}
          isFilterActive={isFilterActive}
          onFilterClick={() => setIsFilterActive((active) => !active)}
        />
      </div>
    );
  }

  return null;
};

export default App;
