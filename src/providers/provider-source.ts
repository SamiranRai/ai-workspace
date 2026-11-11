import type { AIProvider, ConversationRecord } from "../shared/models/conversation";

export interface SourceEntry {
  id: string;
  meta: unknown; // whatever the provider's index or list gives for this conversation
}

export interface SourcePage {
  entries: SourceEntry[]; // at most `limit`, oldest first
  next: string | null; // cursor of the LAST entry returned; null when entries is empty
  done: boolean; // false when more remain after this page
}

export interface LoadedConversation {
  id: string;
  raw: unknown; // null = the full conversation is not available (yet)
}

export interface ProviderSource {
  readonly platform: AIProvider;
  /** How many of the newest conversations to re-read every run. Defaults to 10. API sources use 0. */
  readonly overlap?: number;
  open(): Promise<void>;
  close(): void;
  /** Cheap token for the newest thing in the source. Must change whenever anything new or updated appears. */
  head(signal?: AbortSignal): Promise<string | null>;
  /** Entries strictly after `cursor` (null = from the beginning), oldest first, at most `limit`. */
  changedSince(
    cursor: string | null,
    limit: number,
    signal?: AbortSignal,
  ): Promise<SourcePage>;
  /** The newest few entries, regardless of any cursor. */
  newest(limit: number, signal?: AbortSignal): Promise<SourceEntry[]>;
  /** Full conversations for up to 50 ids, in the SAME ORDER as `ids`; `raw: null` for missing ones. */
  load(ids: string[], signal?: AbortSignal): Promise<LoadedConversation[]>;
  /** Pure function. Same input gives the same output. Throws on unusable input. */
  normalize(raw: unknown, syncedAt: number): ConversationRecord;
  /** True when a recently changed conversation is probably still being written. Pure. */
  isIncomplete(raw: unknown, meta: unknown, now: number): boolean;
}
