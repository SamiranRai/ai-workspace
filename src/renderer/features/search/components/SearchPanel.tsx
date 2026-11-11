import { useState } from "react";
import clsx from "clsx";

import type { AIProvider } from "../../../../shared/models/conversation";
import { CloseIcon } from "../../../shared/components/Icons";
import { registerStyles } from "../../../shared/shadow-styles";
import SearchBox from "./search-box/SearchBox";
import { useSearchPanel } from "../hooks/useSearchPanel";
import type {
  ConversationMatch,
  MessageMatch,
  SearchConversations,
} from "../types";
import PlatformChips from "./platform-chips";
import RecentSearches from "./recent-searches";
import SearchResults from "./SearchResults";
import css from "./SearchPanel.css?inline";

// Register css to shadow-dom
registerStyles(css);

const DEFAULT_PLATFORMS: readonly AIProvider[] = ["chatgpt"];

export interface SearchPanelProps {
  searchConversations: SearchConversations;
  onClose: () => void;
  onSelectMessage?: (
    conversation: ConversationMatch,
    message: MessageMatch,
  ) => void;
  initialPlatforms?: readonly AIProvider[];
  originPlatform?: AIProvider;
  isFilterActive?: boolean;
  onFilterClick?: () => void;
  className?: string;
}

const SearchPanel = ({
  searchConversations,
  onClose,
  onSelectMessage,
  initialPlatforms = DEFAULT_PLATFORMS,
  originPlatform = DEFAULT_PLATFORMS[0],
  isFilterActive,
  onFilterClick,
  className,
}: SearchPanelProps) => {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const panel = useSearchPanel({
    searchConversations,
    initialPlatforms,
    originPlatform,
  });

  return (
    <div
      className={clsx("search-panel", className)}
      role="dialog"
      aria-label="Search conversations"
      aria-modal="true"
    >
      <button
        className="search-panel__close"
        type="button"
        aria-label="Close conversation search"
        onClick={onClose}
      >
        <CloseIcon aria-hidden="true" size={22.785} />
      </button>
      <div
        className="search-panel__body"
        onClick={(event) => event.stopPropagation()}
      >
        <SearchBox
          selectedPlatforms={panel.platforms}
          searchValue={panel.query}
          onSearchValueChange={panel.changeQuery}
          onPlatformsChange={panel.changePlatforms}
          onSearch={panel.submit}
        />

        <PlatformChips
          platforms={panel.platforms}
          originPlatform={originPlatform}
          onRemove={panel.removePlatform}
        />

        <div className="search-panel__results">
          {isFilterActive && (
            <div className="search-panel__filters" aria-label="Search filters">
              <label>
                <input
                  type="checkbox"
                  checked={panel.titlesOnly}
                  onChange={(event) => panel.setTitlesOnly(event.target.checked)}
                />
                Titles only
              </label>
              <label>
                Role
                <select
                  value={panel.roles[0] ?? ""}
                  onChange={(event) =>
                    panel.setRoles(
                      event.target.value
                        ? [event.target.value as (typeof panel.availableRoles)[number]]
                        : [],
                    )
                  }
                >
                  <option value="">All roles</option>
                  {panel.availableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={panel.from ? new Date(panel.from).toISOString().slice(0, 10) : ""}
                  onChange={(event) =>
                    panel.setFrom(
                      event.target.value
                        ? new Date(`${event.target.value}T00:00:00`).getTime()
                        : null,
                    )
                  }
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={panel.to ? new Date(panel.to).toISOString().slice(0, 10) : ""}
                  onChange={(event) =>
                    panel.setTo(
                      event.target.value
                        ? new Date(`${event.target.value}T23:59:59.999`).getTime()
                        : null,
                    )
                  }
                />
              </label>
            </div>
          )}
          {panel.submittedSearch ? (
            <SearchResults
              state={panel.searchState}
              isFilterActive={isFilterActive}
              onFilterClick={onFilterClick}
              onRetry={panel.retry}
              onSelectMessage={onSelectMessage}
              selectedIds={selectedIds}
              onToggleSelected={(id) => {
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
            />
          ) : (
            <RecentSearches
              searches={panel.recentSearches}
              onSelect={panel.submit}
              onClear={panel.clearRecentSearches}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchPanel;
