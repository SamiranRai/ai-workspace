import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { getConversations } from "../../src/storage/storage-client";
import {
  AI_PROVIDERS,
  type AIProvider,
  type ConversationRecord,
} from "../../src/types/conversation";
import {
  DEFAULT_SEARCH_FILTERS,
  searchConversations,
  type SearchFilters,
  type SearchResult,
} from "../../src/search/search";
import "./App.css";

const providerLabels: Record<AIProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
};

const providerIcons: Record<AIProvider, string> = {
  chatgpt: "◉",
  claude: "✳",
  gemini: "✦",
  grok: "◌",
};

function formatDate(timestamp: number | null): string {
  return timestamp
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(timestamp)
    : "Date unavailable";
}

function App() {
  const [records, setRecords] = useState<ConversationRecord[]>([]);
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isGlobal, setIsGlobal] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);
  const [recent, setRecent] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<AIProvider>("chatgpt");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      getConversations(),
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const host = tabs[0]?.url ? new URL(tabs[0].url).hostname : "";
        if (host.includes("claude")) setActiveProvider("claude");
        else if (host.includes("gemini")) setActiveProvider("gemini");
        else if (host.includes("grok")) setActiveProvider("grok");
        else setActiveProvider("chatgpt");
      }),
    ])
      .then(([conversations]) => setRecords(conversations))
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load conversations.",
        ),
      );
    try {
      const saved = JSON.parse(
        localStorage.getItem("smart-folder:recent") ?? "[]",
      );
      if (Array.isArray(saved))
        setRecent(
          saved.filter((item): item is string => typeof item === "string"),
        );
    } catch {
      setRecent([]);
    }
  }, []);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      providers: isGlobal ? providers : [activeProvider],
    }),
    [activeProvider, filters, isGlobal, providers],
  );
  const result: SearchResult = useMemo(
    () => searchConversations(records, query, effectiveFilters),
    [effectiveFilters, query, records],
  );
  const showRecent = query.trim().length === 0;

  function saveSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = [
      trimmed,
      ...recent.filter(
        (item) => item.toLocaleLowerCase() !== trimmed.toLocaleLowerCase(),
      ),
    ].slice(0, 8);
    setRecent(next);
    localStorage.setItem("smart-folder:recent", JSON.stringify(next));
  }

  function toggleProvider(provider: AIProvider) {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider],
    );
  }

  function openConversation(record: ConversationRecord, messageId?: string) {
    if (!record.url) return;
    void browser.tabs.create({
      url: record.url + (messageId ? `#message-${messageId}` : ""),
    });
  }

  return (
    <main className="search-panel">
      <header className="search-header">
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && saveSearch(query)}
            placeholder={
              isGlobal
                ? "Search your AI conversations..."
                : `Search your ${providerLabels[activeProvider]} conversations...`
            }
            aria-label="Search conversations"
            autoFocus
          />
          <select
            className="provider-select"
            value={isGlobal ? "global" : activeProvider}
            onChange={(event) => {
              if (event.target.value === "global") {
                setIsGlobal(true);
                setProviders([]);
              } else {
                setIsGlobal(false);
                setActiveProvider(event.target.value as AIProvider);
              }
            }}
            aria-label="Search platform"
          >
            {AI_PROVIDERS.map((provider) => (
              <option value={provider} key={provider}>
                {providerIcons[provider]} {providerLabels[provider]}
              </option>
            ))}
            <option value="global">All platforms</option>
          </select>
        </div>
        <div className="provider-chips">
          {(isGlobal ? AI_PROVIDERS : [activeProvider]).map((provider) => (
            <button
              className={`chip ${isGlobal && providers.includes(provider) ? "selected" : ""}`}
              key={provider}
              onClick={() =>
                isGlobal ? toggleProvider(provider) : setIsGlobal(true)
              }
            >
              {providerIcons[provider]} {providerLabels[provider]}{" "}
              <span>×</span>
            </button>
          ))}
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {showRecent ? (
        <section className="recent">
          <div className="section-title">
            <span>Recent Searches</span>
            {recent.length > 0 && (
              <button
                onClick={() => {
                  setRecent([]);
                  localStorage.removeItem("smart-folder:recent");
                }}
              >
                × Clear All
              </button>
            )}
          </div>
          <div className="recent-list">
            {recent.map((item) => (
              <button key={item} onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
            {recent.length === 0 && (
              <span className="muted">Your searches will appear here.</span>
            )}
          </div>
        </section>
      ) : (
        <section className="results">
          <div className="result-toolbar">
            <span>
              {result.totalMessages} messages in {result.totalConversations}{" "}
              conversations
            </span>
            <button
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  roles: current.roles.length ? [] : ["user", "assistant"],
                }))
              }
            >
              {filters.roles.length ? "× Filter" : "Filter"}
            </button>
          </div>
          {!isGlobal
            ? result.conversations.map((item) => (
                <ConversationResult
                  key={item.conversation.key}
                  result={item}
                  expanded={expanded === item.conversation.key}
                  onExpand={() =>
                    setExpanded(
                      expanded === item.conversation.key
                        ? null
                        : item.conversation.key,
                    )
                  }
                  onOpen={openConversation}
                />
              ))
            : result.groups.map((group) => (
                <div className="provider-group" key={group.provider}>
                  <h2>
                    {providerIcons[group.provider]}{" "}
                    {providerLabels[group.provider]}{" "}
                    <small>
                      {group.matchingMessages} messages · {group.results.length}{" "}
                      conversations
                    </small>
                  </h2>
                  {group.results.map((item) => (
                    <ConversationResult
                      key={item.conversation.key}
                      result={item}
                      expanded={expanded === item.conversation.key}
                      onExpand={() =>
                        setExpanded(
                          expanded === item.conversation.key
                            ? null
                            : item.conversation.key,
                        )
                      }
                      onOpen={openConversation}
                    />
                  ))}
                </div>
              ))}
          {result.totalConversations === 0 && (
            <p className="empty">No matching conversations found.</p>
          )}
        </section>
      )}
    </main>
  );
}

function ConversationResult({
  result,
  expanded,
  onExpand,
  onOpen,
}: {
  result: SearchResult["conversations"][number];
  expanded: boolean;
  onExpand: () => void;
  onOpen: (record: ConversationRecord, messageId?: string) => void;
}) {
  const { conversation, matches } = result;
  return (
    <article className="conversation">
      <button className="conversation-heading" onClick={onExpand}>
        <span className="conversation-title">
          {providerIcons[conversation.platform]}{" "}
          {conversation.title || "Untitled conversation"}
        </span>
        <span className="conversation-meta">
          {matches.length} Messages
          <br />
          {formatDate(conversation.updatedAt)} <b>{expanded ? "⌃" : "⌄"}</b>
        </span>
      </button>
      {expanded && (
        <div className="message-list">
          {matches.map(({ message, snippet }) => (
            <button
              className={`message ${message.role}`}
              key={message.id}
              onClick={() => onOpen(conversation, message.id)}
            >
              <span className="role">
                {message.role === "user" ? "Q" : "A"}
              </span>
              <span>{snippet}</span>
              <time>{formatDate(message.createdAt)}</time>
            </button>
          ))}
          {matches.length === 0 && (
            <button className="message" onClick={() => onOpen(conversation)}>
              <span className="role">↗</span>
              <span>Open conversation</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default App;
