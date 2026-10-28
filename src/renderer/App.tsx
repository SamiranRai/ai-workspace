
import { useCallback, useEffect, useState } from "react";

import { searchConversations } from "../search/search";
import { getConversations } from "../storage/storage-client";
import { SearchIcon } from "./shared/components/Icons";
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

const search: (
  request: SearchRequest,
) => Promise<readonly ConversationMatch[]> = async ({
  query,
  platforms,
  signal,
}) => {
  if (signal.aborted) return [];

  const records = await getConversations();
  if (signal.aborted) return [];

  const result = searchConversations(records, query, {
    providers: [...platforms],
    roles: [],
    from: null,
    to: null,
  });

  return result.conversations.map(({ conversation, matches }) => ({
    id: conversation.key,
    provider: conversation.platform,
    title: conversation.title,
    url: conversation.url,
    updatedAt: toIsoString(conversation.updatedAt, conversation.lastSyncedAt),
    messages: matches.flatMap(({ message, snippet }) => {
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
        },
      ];
    }),
  }));
};

const App = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
        />
      </div>
    );
  }

  return (
    <button
      className="app-launcher"
      type="button"
      onClick={() => setIsSearchOpen(true)}
      aria-label="Open conversation search (Command X)"
    >
      <SearchIcon aria-hidden="true" />
      Search conversations
    </button>
  );
};

export default App;
