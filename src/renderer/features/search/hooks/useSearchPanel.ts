import { useDeferredValue, useEffect, useState } from "react";

import {
  AI_PROVIDERS,
  type AIProvider,
} from "../../../../types/conversation";
import type { SearchConversations, SubmittedSearch } from "../types";
import { useConversationSearch } from "./useConversationSearch";
import { useRecentSearches } from "./useRecentSearches";

interface UseSearchPanelOptions {
  searchConversations: SearchConversations;
  initialPlatforms: readonly AIProvider[];
  originPlatform: AIProvider;
}

export const useSearchPanel = ({
  searchConversations,
  initialPlatforms,
  originPlatform,
}: UseSearchPanelOptions) => {
  const [query, setQuery] = useState("");
  const [platforms, setPlatforms] = useState<readonly AIProvider[]>(() => {
    const selected = AI_PROVIDERS.filter((platform) =>
      initialPlatforms.includes(platform),
    );
    return selected.length > 0 ? selected : [AI_PROVIDERS[0]];
  });
  const [submittedSearch, setSubmittedSearch] =
    useState<SubmittedSearch | null>(null);
  const deferredQuery = useDeferredValue(query);

  const { state, search, reset } = useConversationSearch(searchConversations);
  const { searches, addSearch, clearSearches } = useRecentSearches();

  const submit = (value: string) => {
    const term = value.trim();
    if (!term) return;

    setQuery(term);
    setSubmittedSearch({ query: term });
    addSearch(term);
  };

  const changeQuery = (value: string) => {
    setQuery(value);

    if (value.trim() === "" && submittedSearch) {
      setSubmittedSearch(null);
      reset();
    }
  };

  useEffect(() => {
    const term = deferredQuery.trim();
    if (!term) return;

    const timeoutId = window.setTimeout(() => {
      setSubmittedSearch({ query: term });
      void search(term, platforms);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [deferredQuery, platforms, search]);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;

    const timeoutId = window.setTimeout(() => {
      addSearch(term);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [addSearch, query]);

  const changePlatforms = (next: readonly AIProvider[]) => {
    // Keep one provider selected. If the final non-origin provider is removed,
    // restore the current site's provider as the useful default.
    if (next.length === 0) {
      setPlatforms([originPlatform]);
      return;
    }

    setPlatforms(next);
  };

  const removePlatform = (platform: AIProvider) => {
    changePlatforms(platforms.filter((selected) => selected !== platform));
  };

  const retry = () => {
    if (submittedSearch) void search(submittedSearch.query, platforms);
  };

  return {
    query,
    platforms,
    submittedSearch,
    searchState: state,
    recentSearches: searches,
    submit,
    changeQuery,
    changePlatforms,
    removePlatform,
    retry,
    clearRecentSearches: clearSearches,
  };
};
