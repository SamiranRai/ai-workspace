import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEARCH_FILTERS,
  highlightText,
  searchConversations,
} from "../src/search/search";
import type { ConversationRecord } from "../src/types/conversation";

const record = (
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord => ({
  key: "chatgpt:1",
  id: "1",
  platform: "chatgpt",
  accountScope: "default",
  title: "Coffee workflow",
  url: "https://example.test/1",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  isArchived: false,
  messages: [
    {
      id: "m1",
      position: 0,
      role: "user",
      content: "What is coffee and how does the workflow work?",
      createdAt: 1_700_000_050_000,
    },
    {
      id: "m2",
      position: 1,
      role: "assistant",
      content: "Coffee is brewed from roasted beans.",
      createdAt: 1_700_000_060_000,
    },
  ],
  sourceSignature: "signature",
  lastSyncedAt: 1_700_000_100_000,
  deletedAtSource: null,
  ...overrides,
});

describe("searchConversations", () => {
  it("matches all query terms across titles and message content", () => {
    const result = searchConversations([record()], "coffee workflow");

    expect(result.totalConversations).toBe(1);
    expect(result.totalMessages).toBe(1);
    expect(result.conversations[0]?.titleMatch).toBe(true);
    expect(result.conversations[0]?.matches[0]?.segments.some((segment) => segment.highlight)).toBe(true);
  });

  it("supports titles-only searches without reporting message matches", () => {
    const result = searchConversations(
      [record()],
      "coffee",
      DEFAULT_SEARCH_FILTERS,
      { titlesOnly: true },
    );

    expect(result.totalConversations).toBe(1);
    expect(result.totalMessages).toBe(0);
    expect(result.conversations[0]?.matches).toHaveLength(0);
  });

  it("applies provider, role, date, and deleted-record filters", () => {
    const deleted = record({ key: "chatgpt:deleted", deletedAtSource: 1_700_000_200_000 });
    const result = searchConversations(
      [record(), deleted],
      "coffee",
      {
        providers: ["chatgpt"],
        roles: ["assistant"],
        from: 1_700_000_055_000,
        to: 1_700_000_070_000,
      },
    );

    expect(result.totalConversations).toBe(1);
    expect(result.totalMessages).toBe(1);
  });

  it("generates bounded snippets around the matching text", () => {
    const long = record({
      messages: [{
        id: "long",
        position: 0,
        role: "assistant",
        content: `${"unrelated ".repeat(40)}coffee${" context".repeat(40)}`,
        createdAt: 1_700_000_060_000,
      }],
    });
    const result = searchConversations([long], "coffee");
    const snippet = result.conversations[0]?.matches[0]?.snippet ?? "";

    expect(snippet).toContain("coffee");
    expect(snippet.length).toBeLessThan(180);
  });
});

describe("highlightText", () => {
  it("highlights case-insensitive matches without HTML interpolation", () => {
    expect(highlightText("Coffee <beans>", "COFFEE")).toEqual([
      { text: "Coffee", highlight: true },
      { text: " <beans>", highlight: false },
    ]);
  });
});
