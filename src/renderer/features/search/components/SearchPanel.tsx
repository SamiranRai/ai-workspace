import clsx from "clsx";

import type { AIProvider } from "../../../../types/conversation";
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
  isFilterActive?: boolean;
  onFilterClick?: () => void;
  className?: string;
}

const SearchPanel = ({
  searchConversations,
  onClose,
  onSelectMessage,
  initialPlatforms = DEFAULT_PLATFORMS,
  isFilterActive,
  onFilterClick,
  className,
}: SearchPanelProps) => {
  const panel = useSearchPanel({ searchConversations, initialPlatforms });

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
        aria-label="Close search"
        onClick={onClose}
      >
        <CloseIcon aria-hidden="true" />
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
          onRemove={panel.removePlatform}
        />

        <div className="search-panel__results">
          {panel.submittedSearch ? (
            <SearchResults
              state={panel.searchState}
              isSinglePlatform={panel.platforms.length === 1}
              isFilterActive={isFilterActive}
              onFilterClick={onFilterClick}
              onRetry={panel.retry}
              onSelectMessage={onSelectMessage}
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
