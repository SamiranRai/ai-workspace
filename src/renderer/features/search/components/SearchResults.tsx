import type { ConversationMatch, MessageMatch, SearchState } from "../types";
import ConversationList from "./conversation-list";
import ResultsSummary from "./ResultsSummary";

interface SearchResultsProps {
  state: SearchState;
  isSinglePlatform: boolean;
  isFilterActive?: boolean;
  onFilterClick?: () => void;
  onRetry: () => void;
  onSelectMessage?: (
    conversation: ConversationMatch,
    message: MessageMatch,
  ) => void;
}

const SearchResults = ({
  state,
  isSinglePlatform,
  isFilterActive,
  onFilterClick,
  onRetry,
  onSelectMessage,
}: SearchResultsProps) => {
  switch (state.status) {
    case "idle":
      return null;

    case "loading":
      return (
        <p className="search-results__status" role="status">
          Searching…
        </p>
      );

    case "error":
      return (
        <div className="search-results__status" role="alert">
          <p>{state.message}</p>
          <button
            className="search-results__retry"
            type="button"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      );

    case "success":
      if (state.results.length === 0) {
        return (
          <p className="search-results__status" role="status">
            No conversations found
          </p>
        );
      }

      return (
        <>
          <ResultsSummary
            results={state.results}
            isFilterActive={isFilterActive}
            onFilterClick={onFilterClick}
          />
          <ConversationList
            results={state.results}
            expandFirst={isSinglePlatform}
            onSelectMessage={onSelectMessage}
          />
        </>
      );
  }
};

export default SearchResults;
