import type {
  AIProvider,
  ConversationRecord,
  MessageRole,
  StoredMessage,
} from "../types/conversation";

export interface SearchFilters {
  providers: AIProvider[];
  roles: MessageRole[];
  from: number | null;
  to: number | null;
}

export interface MessageMatch {
  message: StoredMessage;
  snippet: string;
}

export interface ConversationSearchResult {
  conversation: ConversationRecord;
  matches: MessageMatch[];
  score: number;
}

export interface ProviderSearchGroup {
  provider: AIProvider;
  results: ConversationSearchResult[];
  matchingMessages: number;
}

export interface SearchResult {
  query: string;
  totalConversations: number;
  totalMessages: number;
  conversations: ConversationSearchResult[];
  groups: ProviderSearchGroup[];
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  providers: [],
  roles: [],
  from: null,
  to: null,
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function makeSnippet(content: string, query: string): string {
  const source = content.replace(/\s+/g, " ").trim();
  const index = normalize(source).indexOf(normalize(query));
  if (index < 0 || source.length <= 140) return source;

  const start = Math.max(0, index - 55);
  const end = Math.min(source.length, index + query.length + 75);
  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
}

function matchesFilters(
  conversation: ConversationRecord,
  message: StoredMessage,
  filters: SearchFilters,
): boolean {
  const providerMatches =
    filters.providers.length === 0 ||
    filters.providers.includes(conversation.platform);
  const roleMatches =
    filters.roles.length === 0 || filters.roles.includes(message.role);
  const timestamp = message.createdAt ?? conversation.updatedAt;
  const fromMatches = filters.from === null || (timestamp ?? 0) >= filters.from;
  const toMatches = filters.to === null || (timestamp ?? 0) <= filters.to;
  return providerMatches && roleMatches && fromMatches && toMatches;
}

export function searchConversations(
  records: ConversationRecord[],
  query: string,
  filters: SearchFilters = DEFAULT_SEARCH_FILTERS,
): SearchResult {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return {
      query,
      totalConversations: 0,
      totalMessages: 0,
      conversations: [],
      groups: [],
    };
  }

  const conversations = records
    .filter((conversation) => conversation.deletedAtSource === null)
    .map((conversation): ConversationSearchResult | null => {
      const titleMatch = normalize(conversation.title).includes(normalizedQuery);
      const matches = conversation.messages
        .filter(
          (message) =>
            matchesFilters(conversation, message, filters) &&
            normalize(message.content).includes(normalizedQuery),
        )
        .map((message) => ({
          message,
          snippet: makeSnippet(message.content, normalizedQuery),
        }));

      if (!titleMatch && matches.length === 0) return null;
      return {
        conversation,
        matches,
        score: matches.length * 10 + (titleMatch ? 5 : 0),
      };
    })
    .filter((result): result is ConversationSearchResult => result !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.conversation.updatedAt ?? 0) - (left.conversation.updatedAt ?? 0),
    );

  const groupMap = new Map<AIProvider, ProviderSearchGroup>();
  for (const result of conversations) {
    const existing = groupMap.get(result.conversation.platform);
    if (existing) {
      existing.results.push(result);
      existing.matchingMessages += result.matches.length;
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
      right.matchingMessages - left.matchingMessages ||
      right.results.length - left.results.length,
  );

  return {
    query,
    totalConversations: conversations.length,
    totalMessages: conversations.reduce(
      (total, result) => total + result.matches.length,
      0,
    ),
    conversations,
    groups,
  };
}

// import type {
//   AIProvider,
//   ConversationRecord,
//   MessageRole,
//   StoredMessage,
// } from "../types/conversation";

// /* ------------------------------------------------------------------ */
// /* Types                                                               */
// /* ------------------------------------------------------------------ */

// export interface SearchFilters {
//   providers: AIProvider[];
//   roles: MessageRole[];
//   from: number | null;
//   to: number | null;
// }

// export interface SearchOptions {
//   /** Only match conversation titles (the "Titles only" toggle). */
//   titlesOnly?: boolean;
//   /** Match whole words only ("go" will not match "gojiberry"). */
//   wholeWord?: boolean;
//   /** Approximate snippet length in characters. Default 150. */
//   snippetLength?: number;
// }

// export interface TextRange {
//   start: number;
//   end: number;
// }

// /** Render these as <mark> / <span>. No HTML strings, so no XSS risk. */
// export interface TextSegment {
//   text: string;
//   highlight: boolean;
// }

// export interface MessageMatch {
//   message: StoredMessage;
//   /** Plain-text snippet (with "…" edges). Kept for backward compatibility. */
//   snippet: string;
//   /** Same snippet, split into highlighted / non-highlighted parts. */
//   segments: TextSegment[];
//   score: number;
// }

// export interface ConversationSearchResult {
//   conversation: ConversationRecord;
//   matches: MessageMatch[];
//   score: number;
//   titleMatch: boolean;
//   /** Title split into highlighted / non-highlighted parts. */
//   titleSegments: TextSegment[];
// }

// export interface ProviderSearchGroup {
//   provider: AIProvider;
//   results: ConversationSearchResult[];
//   matchingMessages: number;
// }

// export interface SearchResult {
//   query: string;
//   /** Normalized terms actually searched (useful for highlighting elsewhere). */
//   terms: string[];
//   totalConversations: number;
//   totalMessages: number;
//   elapsedMs: number;
//   conversations: ConversationSearchResult[];
//   groups: ProviderSearchGroup[];
// }

// export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
//   providers: [],
//   roles: [],
//   from: null,
//   to: null,
// };

// /* ------------------------------------------------------------------ */
// /* Folding: case-insensitive, accent-insensitive, whitespace-collapsed */
// /* matching WITH an index map back to the original text, so highlight  */
// /* offsets are always exact (toLowerCase()/normalize() can change      */
// /* string length, which is what breaks naive indexOf-based highlights) */
// /* ------------------------------------------------------------------ */

// interface FoldedText {
//   text: string;
//   /** folded index -> original start / end. null = identity (ASCII fast path). */
//   starts: number[] | null;
//   ends: number[] | null;
// }

// const WS = /\s/;
// const LATIN_MARKS = /[\u0300-\u036f]/g; // Latin combining accents only; keeps Devanagari etc. intact
// const SIMPLE_TEXT = /^[\x00-\x7f]*$/;
// const NEEDS_WS_COLLAPSE = /[^\S ]| {2}/;

// function fold(source: string): FoldedText {
//   // Fast path: plain ASCII with already-single spaces -> identity mapping.
//   if (SIMPLE_TEXT.test(source) && !NEEDS_WS_COLLAPSE.test(source)) {
//     return { text: source.toLowerCase(), starts: null, ends: null };
//   }

//   let text = "";
//   const starts: number[] = [];
//   const ends: number[] = [];
//   let lastWasSpace = false;
//   let i = 0;

//   for (const char of source) {
//     const end = i + char.length;

//     if (WS.test(char)) {
//       if (lastWasSpace) {
//         ends[ends.length - 1] = end;
//       } else {
//         text += " ";
//         starts.push(i);
//         ends.push(end);
//         lastWasSpace = true;
//       }
//     } else {
//       const piece = char
//         .normalize("NFD")
//         .toLowerCase()
//         .replace(LATIN_MARKS, "");
//       if (piece === "") {
//         // Stray combining mark: extend previous highlight over it.
//         if (ends.length > 0) ends[ends.length - 1] = end;
//       } else {
//         for (let k = 0; k < piece.length; k++) {
//           starts.push(i);
//           ends.push(end);
//         }
//         text += piece;
//         lastWasSpace = false;
//       }
//     }
//     i = end;
//   }

//   return { text, starts, ends };
// }

// function toOriginal(folded: FoldedText, start: number, end: number): TextRange {
//   if (!folded.starts || !folded.ends) return { start, end };
//   return { start: folded.starts[start], end: folded.ends[end - 1] };
// }

// /* ------------------------------------------------------------------ */
// /* Query parsing                                                       */
// /* ------------------------------------------------------------------ */

// /**
//  * "gojiberry workflow"        -> two terms, BOTH must appear (any order)
//  * "\"gojiberry workflow\""    -> one exact phrase
//  */
// export function parseSearchTerms(query: string): string[] {
//   const terms: string[] = [];
//   const re = /"([^"]+)"|(\S+)/g;
//   let match: RegExpExecArray | null;

//   while ((match = re.exec(query)) !== null) {
//     const raw = (match[1] ?? match[2].replace(/^"+|"+$/g, ""))
//       .replace(/\s+/g, " ")
//       .trim();
//     const term = fold(raw).text;
//     if (term && !terms.includes(term)) terms.push(term);
//   }
//   return terms;
// }

// /* ------------------------------------------------------------------ */
// /* Matching                                                            */
// /* ------------------------------------------------------------------ */

// interface TermRange extends TextRange {
//   term: number;
// }

// function isBoundary(text: string, index: number): boolean {
//   if (index < 0 || index >= text.length) return true;
//   return !/[\p{L}\p{N}_]/u.test(text[index]);
// }

// function findAll(hay: string, needle: string, wholeWord: boolean): TextRange[] {
//   const out: TextRange[] = [];
//   if (!needle) return out;

//   let from = 0;
//   while (from <= hay.length - needle.length) {
//     const index = hay.indexOf(needle, from);
//     if (index < 0) break;
//     const end = index + needle.length;
//     if (!wholeWord || (isBoundary(hay, index - 1) && isBoundary(hay, end))) {
//       out.push({ start: index, end });
//       from = end;
//     } else {
//       from = index + 1;
//     }
//   }
//   return out;
// }

// /** Returns ranges in ORIGINAL-text coordinates, or null if any term is missing (AND logic). */
// function collectRanges(
//   folded: FoldedText,
//   terms: string[],
//   wholeWord: boolean,
// ): TermRange[] | null {
//   const all: TermRange[] = [];
//   for (let t = 0; t < terms.length; t++) {
//     const found = findAll(folded.text, terms[t], wholeWord);
//     if (found.length === 0) return null;
//     for (const range of found) {
//       all.push({ ...toOriginal(folded, range.start, range.end), term: t });
//     }
//   }
//   all.sort((a, b) => a.start - b.start || b.end - a.end);
//   return all;
// }

// function mergeRanges(ranges: TextRange[]): TextRange[] {
//   const merged: TextRange[] = [];
//   for (const range of ranges) {
//     const last = merged[merged.length - 1];
//     if (last && range.start <= last.end) {
//       last.end = Math.max(last.end, range.end);
//     } else {
//       merged.push({ start: range.start, end: range.end });
//     }
//   }
//   return merged;
// }

// /* ------------------------------------------------------------------ */
// /* Segments + snippets                                                 */
// /* ------------------------------------------------------------------ */

// function buildSegments(
//   raw: string,
//   ranges: TextRange[],
//   start: number,
//   end: number,
//   collapse: boolean,
// ): TextSegment[] {
//   const segments: TextSegment[] = [];
//   const clean = (value: string) =>
//     collapse ? value.replace(/\s+/g, " ") : value;
//   const push = (a: number, b: number, highlight: boolean) => {
//     if (b > a) segments.push({ text: clean(raw.slice(a, b)), highlight });
//   };

//   let cursor = start;
//   for (const range of ranges) {
//     const s = Math.max(range.start, start);
//     const e = Math.min(range.end, end);
//     if (e <= s) continue;
//     push(cursor, s, false);
//     push(s, e, true);
//     cursor = e;
//   }
//   push(cursor, end, false);

//   if (collapse && segments.length > 0) {
//     segments[0].text = segments[0].text.trimStart();
//     const last = segments.length - 1;
//     segments[last].text = segments[last].text.trimEnd();
//   }
//   return segments.filter((segment) => segment.text.length > 0);
// }

// /** Pick the earliest window that contains the most distinct query terms. */
// function pickAnchor(
//   ranges: TermRange[],
//   termCount: number,
//   width: number,
// ): number {
//   let bestAnchor = ranges[0].start;
//   let bestDistinct = 0;
//   const limit = Math.min(ranges.length, 200);

//   for (let i = 0; i < limit; i++) {
//     const anchor = ranges[i].start;
//     const seen = new Set<number>();
//     for (let j = i; j < ranges.length && ranges[j].end - anchor <= width; j++) {
//       seen.add(ranges[j].term);
//     }
//     if (seen.size > bestDistinct) {
//       bestDistinct = seen.size;
//       bestAnchor = anchor;
//       if (bestDistinct === termCount) break;
//     }
//   }
//   return bestAnchor;
// }

// function buildSnippet(
//   raw: string,
//   ranges: TermRange[],
//   termCount: number,
//   width: number,
// ): { snippet: string; segments: TextSegment[] } {
//   const merged = mergeRanges(ranges);
//   const lead = 50;
//   let start = 0;
//   let end = raw.length;

//   if (raw.length > width + lead) {
//     const anchor = pickAnchor(ranges, termCount, width);
//     start = Math.max(0, anchor - lead);
//     end = Math.min(raw.length, anchor + width);

//     // Snap to word edges so we don't cut words in half.
//     while (start > 0 && start < anchor && !WS.test(raw[start - 1])) start++;
//     let extra = 0;
//     while (end < raw.length && extra < 15 && !WS.test(raw[end])) {
//       end++;
//       extra++;
//     }
//   }

//   const segments = buildSegments(raw, merged, start, end, true);
//   const body = segments.map((segment) => segment.text).join("");
//   const snippet = `${start > 0 ? "…" : ""}${body}${end < raw.length ? "…" : ""}`;
//   return { snippet, segments };
// }

// /**
//  * Highlight an entire text (e.g. a full message body when the user opens a
//  * result). Preserves newlines. Use the same `query` the user searched with.
//  */
// export function highlightText(
//   text: string,
//   query: string,
//   options: Pick<SearchOptions, "wholeWord"> = {},
// ): TextSegment[] {
//   const terms = parseSearchTerms(query);
//   if (terms.length === 0) return [{ text, highlight: false }];

//   const folded = fold(text);
//   const ranges: TextRange[] = [];
//   for (const term of terms) {
//     ranges.push(
//       ...findAll(folded.text, term, options.wholeWord ?? false).map((r) =>
//         toOriginal(folded, r.start, r.end),
//       ),
//     );
//   }
//   ranges.sort((a, b) => a.start - b.start || b.end - a.end);
//   return buildSegments(text, mergeRanges(ranges), 0, text.length, false);
// }

// /* ------------------------------------------------------------------ */
// /* Filters                                                             */
// /* ------------------------------------------------------------------ */

// function inTimeRange(
//   timestamp: number | null | undefined,
//   filters: SearchFilters,
// ): boolean {
//   const value = timestamp ?? 0;
//   return (
//     (filters.from === null || value >= filters.from) &&
//     (filters.to === null || value <= filters.to)
//   );
// }

// /* ------------------------------------------------------------------ */
// /* Main search                                                         */
// /* ------------------------------------------------------------------ */

// const now = () =>
//   typeof performance !== "undefined" ? performance.now() : Date.now();

// export function searchConversations(
//   records: ConversationRecord[],
//   query: string,
//   filters: SearchFilters = DEFAULT_SEARCH_FILTERS,
//   options: SearchOptions = {},
// ): SearchResult {
//   const startedAt = now();
//   const terms = parseSearchTerms(query);

//   if (terms.length === 0) {
//     return {
//       query,
//       terms,
//       totalConversations: 0,
//       totalMessages: 0,
//       elapsedMs: 0,
//       conversations: [],
//       groups: [],
//     };
//   }

//   const wholeWord = options.wholeWord ?? false;
//   const width = options.snippetLength ?? 150;
//   // Full contiguous phrase, used only to rank exact-phrase hits higher.
//   const phrase = fold(query.replace(/"/g, "").replace(/\s+/g, " ").trim()).text;

//   const conversations: ConversationSearchResult[] = [];

//   for (const conversation of records) {
//     // Provider filter applies to the whole conversation (title matches included).
//     if (
//       filters.providers.length > 0 &&
//       !filters.providers.includes(conversation.platform)
//     ) {
//       continue;
//     }

//     const title = conversation.title ?? "";
//     const titleFolded = fold(title);
//     const titleRanges = collectRanges(titleFolded, terms, wholeWord);
//     const titleMatch =
//       titleRanges !== null && inTimeRange(conversation.updatedAt, filters);

//     const matches: MessageMatch[] = [];

//     if (!options.titlesOnly) {
//       for (const message of conversation.messages) {
//         if (filters.roles.length > 0 && !filters.roles.includes(message.role))
//           continue;
//         if (!inTimeRange(message.createdAt ?? conversation.updatedAt, filters))
//           continue;

//         const content = message.content ?? "";
//         const folded = fold(content);
//         const ranges = collectRanges(folded, terms, wholeWord);
//         if (!ranges) continue;

//         const { snippet, segments } = buildSnippet(
//           content,
//           ranges,
//           terms.length,
//           width,
//         );
//         const phraseBonus =
//           terms.length > 1 && folded.text.includes(phrase) ? 8 : 0;
//         matches.push({
//           message,
//           snippet,
//           segments,
//           score: 10 + phraseBonus + Math.min(ranges.length, 5),
//         });
//       }
//     }

//     if (!titleMatch && matches.length === 0) continue;

//     const titlePhraseBonus =
//       titleMatch && terms.length > 1 && titleFolded.text.includes(phrase)
//         ? 20
//         : 0;
//     const bestMessage = matches.reduce((max, m) => Math.max(max, m.score), 0);

//     conversations.push({
//       conversation,
//       matches, // chronological order, same as the conversation
//       titleMatch,
//       titleSegments: titleMatch
//         ? buildSegments(title, mergeRanges(titleRanges!), 0, title.length, true)
//         : [{ text: title, highlight: false }],
//       score:
//         (titleMatch ? 30 + titlePhraseBonus : 0) +
//         bestMessage +
//         Math.min(matches.length, 10) * 2,
//     });
//   }

//   conversations.sort(
//     (left, right) =>
//       right.score - left.score ||
//       (right.conversation.updatedAt ?? 0) - (left.conversation.updatedAt ?? 0),
//   );

//   const groupMap = new Map<AIProvider, ProviderSearchGroup>();
//   for (const result of conversations) {
//     const existing = groupMap.get(result.conversation.platform);
//     if (existing) {
//       existing.results.push(result);
//       existing.matchingMessages += result.matches.length;
//     } else {
//       groupMap.set(result.conversation.platform, {
//         provider: result.conversation.platform,
//         results: [result],
//         matchingMessages: result.matches.length,
//       });
//     }
//   }

//   const groups = [...groupMap.values()].sort(
//     (left, right) =>
//       right.matchingMessages - left.matchingMessages ||
//       right.results.length - left.results.length,
//   );

//   return {
//     query,
//     terms,
//     totalConversations: conversations.length,
//     totalMessages: conversations.reduce(
//       (total, r) => total + r.matches.length,
//       0,
//     ),
//     elapsedMs: now() - startedAt,
//     conversations,
//     groups,
//   };
// }