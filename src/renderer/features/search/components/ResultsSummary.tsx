import clsx from "clsx";

import { CloseIcon } from "../../../shared/components/Icons";
import type { ConversationMatch } from "../types";
import { pluralize } from "../utils/format";
import { registerStyles } from "../../../shared/shadow-styles";
import css from "./ResultsSummary.css?inline";

registerStyles(css);

interface ResultsSummaryProps {
  results: readonly ConversationMatch[];
  isFilterActive?: boolean;
  onFilterClick?: () => void;
}

const ResultsSummary = ({
  results,
  isFilterActive = false,
  onFilterClick,
}: ResultsSummaryProps) => {
  const messageCount = results.reduce(
    (total, conversation) => total + conversation.messages.length,
    0,
  );

  return (
    <div className="results-summary">
      <p className="results-summary__text">
        {pluralize(messageCount, "message")} in{" "}
        {pluralize(results.length, "conversation")}
      </p>

      {onFilterClick && (
        <button
          className={clsx(
            "results-summary__filter",
            isFilterActive && "results-summary__filter--active",
          )}
          type="button"
          aria-pressed={isFilterActive}
          onClick={onFilterClick}
        >
          {isFilterActive && <CloseIcon aria-hidden="true" />}
          Filter
        </button>
      )}
    </div>
  );
};

export default ResultsSummary;
