import type {
  AIProvider,
  ConversationRecord,
  MessageRole,
  StoredMessage,
} from "../shared/models/conversation";

export interface SearchFilters {
  providers: AIProvider[];
  roles: MessageRole[];
  from: number | null;
  to: number | null;
}

export interface SearchOptions {
  titlesOnly?: boolean;
  wholeWord?: boolean;
  snippetLength?: number;
}

export interface TextSegment {
  text: string;
  highlight: boolean;
}

export interface MessageMatch {
  message: StoredMessage;
  snippet: string;
  segments: TextSegment[];
  score: number;
}

export interface ConversationSearchResult {
  conversation: ConversationRecord;
  matches: MessageMatch[];
  score: number;
  titleMatch: boolean;
  titleSegments: TextSegment[];
}

export interface ProviderSearchGroup {
  provider: AIProvider;
  results: ConversationSearchResult[];
  matchingMessages: number;
}

export interface SearchResult {
  query: string;
  terms: string[];
  totalConversations: number;
  totalMessages: number;
  elapsedMs: number;
  conversations: ConversationSearchResult[];
  groups: ProviderSearchGroup[];
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  providers: [],
  roles: [],
  from: null,
  to: null,
};

interface TextRange {
  start: number;
  end: number;
}

interface FoldedText {
  text: string;
  starts: number[] | null;
  ends: number[] | null;
}

interface TermRange extends TextRange {
  term: number;
}

const LATIN_MARKS = /[\u0300-\u036f]/g;
const SIMPLE_TEXT = /^[\x00-\x7f]*$/;
const NEEDS_WS_COLLAPSE = /[^\S ]| {2}/;

function fold(source: string): FoldedText {
  if (SIMPLE_TEXT.test(source) && !NEEDS_WS_COLLAPSE.test(source)) {
    return { text: source.toLowerCase(), starts: null, ends: null };
  }

  if (SIMPLE_TEXT.test(source)) {
    let text = "";
    const starts: number[] = [];
    const ends: number[] = [];
    let lastWasSpace = false;

    for (let index = 0; index < source.length; index++) {
      const code = source.charCodeAt(index);
      if (code === 32 || (code >= 9 && code <= 13)) {
        if (lastWasSpace) {
          ends[ends.length - 1] = index + 1;
        } else {
          text += " ";
          starts.push(index);
          ends.push(index + 1);
          lastWasSpace = true;
        }
        continue;
      }

      const loweredCode =
        code >= 65 && code <= 90 ? code + 32 : code;
      text += String.fromCharCode(loweredCode);
      starts.push(index);
      ends.push(index + 1);
      lastWasSpace = false;
    }

    return { text, starts, ends };
  }

  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let lastWasSpace = false;
  let index = 0;

  for (const character of source) {
    const end = index + character.length;
    if (/\s/.test(character)) {
      if (lastWasSpace) ends[ends.length - 1] = end;
      else {
        text += " ";
        starts.push(index);
        ends.push(end);
        lastWasSpace = true;
      }
    } else {
      const piece = character
        .normalize("NFD")
        .toLowerCase()
        .replace(LATIN_MARKS, "");
      for (let offset = 0; offset < piece.length; offset++) {
        starts.push(index);
        ends.push(end);
      }
      text += piece;
      lastWasSpace = false;
    }
    index = end;
  }

  return { text, starts, ends };
}

function toOriginal(
  folded: FoldedText,
  start: number,
  end: number,
): TextRange {
  if (!folded.starts || !folded.ends) return { start, end };
  return { start: folded.starts[start], end: folded.ends[end - 1] };
}

export function parseSearchTerms(query: string): string[] {
  const terms: string[] = [];
  const expression = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(query)) !== null) {
    const raw = (match[1] ?? match[2]).replace(/^"+|"+$/g, "");
    const term = fold(raw.replace(/\s+/g, " ").trim()).text;
    if (term && !terms.includes(term)) terms.push(term);
  }
  return terms;
}

function isBoundary(text: string, index: number): boolean {
  return index < 0 || index >= text.length || !/[\p{L}\p{N}_]/u.test(text[index]);
}

function findAll(
  haystack: string,
  needle: string,
  wholeWord: boolean,
): TextRange[] {
  const ranges: TextRange[] = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    const end = index + needle.length;
    if (!wholeWord || (isBoundary(haystack, index - 1) && isBoundary(haystack, end))) {
      ranges.push({ start: index, end });
      from = end;
    } else {
      from = index + 1;
    }
  }
  return ranges;
}

function collectRanges(
  folded: FoldedText,
  terms: string[],
  wholeWord: boolean,
): TermRange[] | null {
  const ranges: TermRange[] = [];
  for (let term = 0; term < terms.length; term++) {
    const found = findAll(folded.text, terms[term], wholeWord);
    if (found.length === 0) return null;
    ranges.push(
      ...found.map((range) => ({
        ...toOriginal(folded, range.start, range.end),
        term,
      })),
    );
  }
  return ranges.sort((left, right) => left.start - right.start || right.end - left.end);
}

function mayContainTerms(source: string, terms: string[]): boolean {
  if (!SIMPLE_TEXT.test(source) || terms.some((term) => /\s/.test(term))) {
    return true;
  }

  const lowered = source.toLowerCase();
  return terms.every((term) => lowered.includes(term));
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const merged: TextRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function buildSegments(
  source: string,
  ranges: TextRange[],
  start: number,
  end: number,
  collapse: boolean,
): TextSegment[] {
  const segments: TextSegment[] = [];
  const clean = (value: string) => (collapse ? value.replace(/\s+/g, " ") : value);
  const push = (from: number, to: number, highlight: boolean) => {
    if (to > from) segments.push({ text: clean(source.slice(from, to)), highlight });
  };
  let cursor = start;
  for (const range of ranges) {
    const from = Math.max(range.start, start);
    const to = Math.min(range.end, end);
    if (to <= from) continue;
    push(cursor, from, false);
    push(from, to, true);
    cursor = to;
  }
  push(cursor, end, false);
  if (collapse && segments.length > 0) {
    segments[0].text = segments[0].text.trimStart();
    segments[segments.length - 1].text = segments[segments.length - 1].text.trimEnd();
  }
  return segments.filter((segment) => segment.text.length > 0);
}

function buildSnippet(
  source: string,
  ranges: TermRange[],
  termCount: number,
  width: number,
): { snippet: string; segments: TextSegment[] } {
  const merged = mergeRanges(ranges);
  const anchor = ranges
    .slice(0, 200)
    .reduce((best, range) => (range.start < best ? range.start : best), ranges[0].start);
  let start = 0;
  let end = source.length;
  if (source.length > width + 50) {
    start = Math.max(0, anchor - 50);
    end = Math.min(source.length, start + width);
    while (start > 0 && !/\s/.test(source[start - 1])) start--;
    while (end < source.length && !/\s/.test(source[end])) end++;
  }
  const segments = buildSegments(source, merged, start, end, true);
  const body = segments.map((segment) => segment.text).join("");
  return {
    snippet: `${start > 0 ? "…" : ""}${body}${end < source.length ? "…" : ""}`,
    segments,
  };
}

export function highlightText(text: string, query: string): TextSegment[] {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return [{ text, highlight: false }];
  const folded = fold(text);
  const ranges = terms.flatMap((term) =>
    findAll(folded.text, term, false).map((range) => toOriginal(folded, range.start, range.end)),
  );
  return buildSegments(text, mergeRanges(ranges), 0, text.length, false);
}

function inTimeRange(timestamp: number | null, filters: SearchFilters): boolean {
  const value = timestamp ?? 0;
  return (
    (filters.from === null || value >= filters.from) &&
    (filters.to === null || value <= filters.to)
  );
}

function searchConversation(
  conversation: ConversationRecord,
  terms: string[],
  filters: SearchFilters,
  options: SearchOptions,
  phrase: string,
): ConversationSearchResult | null {
  if (
    conversation.deletedAtSource !== null ||
    (filters.providers.length > 0 && !filters.providers.includes(conversation.platform))
  ) return null;

  const wholeWord = options.wholeWord ?? false;
  const width = options.snippetLength ?? 150;
  const title = conversation.title ?? "";
  const titleFolded = mayContainTerms(title, terms) ? fold(title) : null;
  const titleRanges = titleFolded
    ? collectRanges(titleFolded, terms, wholeWord)
    : null;
  const titleMatch = titleRanges !== null && inTimeRange(conversation.updatedAt, filters);
  const matches: MessageMatch[] = [];

  if (!options.titlesOnly) {
    for (const message of conversation.messages) {
      if (
        (filters.roles.length > 0 && !filters.roles.includes(message.role)) ||
        !inTimeRange(message.createdAt ?? conversation.updatedAt, filters)
      ) continue;
      const content = message.content ?? "";
      if (!mayContainTerms(content, terms)) continue;
      const folded = fold(content);
      const ranges = collectRanges(folded, terms, wholeWord);
      if (!ranges) continue;
      const snippet = buildSnippet(content, ranges, terms.length, width);
      const phraseBonus = terms.length > 1 && folded.text.includes(phrase) ? 8 : 0;
      matches.push({
        message,
        snippet: snippet.snippet,
        segments: snippet.segments,
        score: 10 + phraseBonus + Math.min(ranges.length, 5),
      });
    }
  }

  if (!titleMatch && matches.length === 0) return null;
  const titlePhraseBonus =
    titleMatch && terms.length > 1 && titleFolded?.text.includes(phrase) ? 20 : 0;
  const bestMessage = matches.reduce((max, match) => Math.max(max, match.score), 0);
  return {
    conversation,
    matches,
    titleMatch,
    titleSegments: titleMatch
      ? buildSegments(title, mergeRanges(titleRanges ?? []), 0, title.length, true)
      : [{ text: title, highlight: false }],
    score: (titleMatch ? 30 + titlePhraseBonus : 0) + bestMessage + Math.min(matches.length, 10) * 2,
  };
}

function finishSearch(
  query: string,
  terms: string[],
  conversations: ConversationSearchResult[],
  startedAt: number,
): SearchResult {
  conversations.sort(
    (left, right) =>
      right.score - left.score ||
      (right.conversation.updatedAt ?? 0) - (left.conversation.updatedAt ?? 0),
  );
  const groupMap = new Map<AIProvider, ProviderSearchGroup>();
  for (const result of conversations) {
    const group = groupMap.get(result.conversation.platform);
    if (group) {
      group.results.push(result);
      group.matchingMessages += result.matches.length;
    } else {
      groupMap.set(result.conversation.platform, {
        provider: result.conversation.platform,
        results: [result],
        matchingMessages: result.matches.length,
      });
    }
  }
  const groups = [...groupMap.values()].sort(
    (left, right) =>
      right.matchingMessages - left.matchingMessages || right.results.length - left.results.length,
  );
  return {
    query,
    terms,
    totalConversations: conversations.length,
    totalMessages: conversations.reduce((total, result) => total + result.matches.length, 0),
    elapsedMs: (typeof performance === "undefined" ? Date.now() : performance.now()) - startedAt,
    conversations,
    groups,
  };
}

export function searchConversations(
  records: ConversationRecord[],
  query: string,
  filters: SearchFilters = DEFAULT_SEARCH_FILTERS,
  options: SearchOptions = {},
): SearchResult {
  const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  const terms = parseSearchTerms(query);
  if (terms.length === 0) {
    return { query, terms, totalConversations: 0, totalMessages: 0, elapsedMs: 0, conversations: [], groups: [] };
  }

  const phrase = fold(query.replace(/"/g, "").replace(/\s+/g, " ").trim()).text;
  const conversations: ConversationSearchResult[] = [];

  for (const conversation of records) {
    const result = searchConversation(conversation, terms, filters, options, phrase);
    if (result) conversations.push(result);
  }

  return finishSearch(query, terms, conversations, startedAt);
}

export async function searchConversationsAsync(
  records: ConversationRecord[],
  query: string,
  filters: SearchFilters = DEFAULT_SEARCH_FILTERS,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  const terms = parseSearchTerms(query);
  if (terms.length === 0) {
    return { query, terms, totalConversations: 0, totalMessages: 0, elapsedMs: 0, conversations: [], groups: [] };
  }

  const phrase = fold(query.replace(/"/g, "").replace(/\s+/g, " ").trim()).text;
  const conversations: ConversationSearchResult[] = [];
  for (let index = 0; index < records.length; index++) {
    if (signal?.aborted) throw new DOMException("Search aborted", "AbortError");
    const result = searchConversation(records[index], terms, filters, options, phrase);
    if (result) conversations.push(result);
    if ((index + 1) % 32 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return finishSearch(query, terms, conversations, startedAt);
}
