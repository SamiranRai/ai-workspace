import { useId } from "react";

import { TrashIcon } from "../../../../shared/components/Icons";
import { registerStyles } from "../../../../shared/shadow-styles";
import css from "./RecentSearches.css?inline";

registerStyles(css);

interface RecentSearchesProps {
  searches: readonly string[];
  onSelect: (term: string) => void;
  onClear: () => void;
}

const RecentSearches = ({ searches, onSelect, onClear }: RecentSearchesProps) => {
  const headingId = useId();

  if (searches.length === 0) return null;

  return (
    <section className="recent-searches" aria-labelledby={headingId}>
      <div className="recent-searches__header">
        <h2 className="recent-searches__title" id={headingId}>
          Recent Searches
        </h2>
        <button
          className="recent-searches__clear"
          type="button"
          onClick={onClear}
        >
          <TrashIcon aria-hidden="true" size={16.5}/>
          Clear All
        </button>
      </div>

      <ul className="recent-searches__list">
        {searches.map((term) => (
          <li key={term}>
            <button
              className="recent-searches__item"
              type="button"
              onClick={() => onSelect(term)}
            >
              {term}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default RecentSearches;
