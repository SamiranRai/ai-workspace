import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { AIProvider, MessageRole } from "../../../../types/conversation";
import type { SearchConversations, SearchState } from "../types";

const FALLBACK_ERROR_MESSAGE = "Something went wrong while searching.";

export const useConversationSearch = (
  searchConversations: SearchConversations,
) => {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [, startTransition] = useTransition();
  const controllerRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (
      query: string,
      platforms: readonly AIProvider[],
      options: {
        roles: readonly MessageRole[];
        from: number | null;
        to: number | null;
        titlesOnly: boolean;
      },
    ) => {
      // Only the latest request may update state
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      startTransition(() => {
        setState({ status: "loading" });
      });

      try {
        const results = await searchConversations({
          query,
          platforms,
          ...options,
          signal: controller.signal,
        });
        if (controllerRef.current === controller && !controller.signal.aborted) {
          startTransition(() => {
            setState({ status: "success", results });
          });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        startTransition(() => {
          setState({
            status: "error",
            message:
              error instanceof Error && error.message
                ? error.message
                : FALLBACK_ERROR_MESSAGE,
          });
        });
      }
    },
    [searchConversations, startTransition],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    startTransition(() => {
      setState({ status: "idle" });
    });
  }, [startTransition]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, search, reset };
};
