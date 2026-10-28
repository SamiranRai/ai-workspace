import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "smart-folder:recent-searches";
const MAX_RECENT_SEARCHES = 8;

const readStoredSearches = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const storeSearches = (searches: string[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Storage can be blocked or full; recent searches are non-critical
  }
};

export const useRecentSearches = () => {
  const [searches, setSearches] = useState(readStoredSearches);

  useEffect(() => {
    storeSearches(searches);
  }, [searches]);

  const addSearch = useCallback((term: string) => {
    setSearches((current) =>
      [
        term,
        ...current.filter((item) => item.toLowerCase() !== term.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES),
    );
  }, []);

  const clearSearches = useCallback(() => setSearches([]), []);

  return { searches, addSearch, clearSearches };
};
