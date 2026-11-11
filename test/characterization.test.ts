import { beforeEach, describe, expect, it } from "vitest";

import { normalizeChatGPTConversation } from "../src/providers/chatgpt/conversation-normalizer";
import { normalizeClaudeConversation } from "../src/providers/claude/conversation-normalizer";
import { normalizeGeminiConversation } from "../src/providers/gemini/conversation-normalizer";
import { normalizeGrokConversation } from "../src/providers/grok/conversation-normalizer";
import { isRequestSyncNowMessage, isSyncNowMessage } from "../src/sync/sync-messages";
import { ConversationRepository } from "../src/storage/conversation-repository";
import { db } from "../src/storage/database";

describe("conversation normalization", () => {
  it("preserves ChatGPT's current shared record shape and timestamp conversion", () => {
    const result = normalizeChatGPTConversation(
      {
        id: "chat-1",
        title: "  Coffee  ",
        account_id: "account-1",
        create_time: 1_700_000_000,
        update_time: "2023-11-14T22:13:20",
        messages: [
          {
            id: "message-1",
            role: "user",
            content: "Hello",
            createTime: 1_700_000_001,
          },
          {
            id: "message-2",
            role: "unknown-role",
            content: null,
          },
        ],
      },
      1_700_000_100_000,
    );

    expect(result).toMatchObject({
      key: "chatgpt:chat-1",
      id: "chat-1",
      platform: "chatgpt",
      accountScope: "account-1",
      title: "Coffee",
      url: "https://chatgpt.com/c/chat-1",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      lastSyncedAt: 1_700_000_100_000,
      deletedAtSource: null,
    });
    expect(result.messages).toEqual([
      {
        id: "message-1",
        position: 0,
        role: "user",
        content: "Hello",
        createdAt: 1_700_000_001_000,
      },
      {
        id: "message-2",
        position: 1,
        role: "other",
        content: "",
        createdAt: null,
      },
    ]);
  });

  it.each([
    ["claude", normalizeClaudeConversation, "human", "user", "https://claude.ai/chat/claude-1"],
    ["gemini", normalizeGeminiConversation, "model", "assistant", "https://gemini.google.com/app/gemini-1"],
    ["grok", normalizeGrokConversation, "assistant", "assistant", "https://grok.com/chat/grok-1"],
  ] as const)(
    "maps %s provider roles into the shared model",
    (_provider, normalize, role, expectedRole, url) => {
      const id = `${_provider}-1`;
      const result = normalize({
        id,
        title: "Test",
        messages: [{ role, content: "Answer" }],
      }, 123);

      expect(result).toMatchObject({
        id,
        url,
        title: "Test",
        lastSyncedAt: 123,
      });
      expect(result.messages[0]).toMatchObject({
        position: 0,
        role: expectedRole,
        content: "Answer",
      });
    },
  );
});

describe("storage repository behavior", () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.syncState.clear();
  });

  it("counts nested messages and stores checkpoints with upserts", async () => {
    const repository = new ConversationRepository();
    const conversation = normalizeChatGPTConversation({
      id: "stored",
      title: "Stored",
      messages: [
        { id: "one", role: "user", content: "One" },
        { id: "two", role: "assistant", content: "Two" },
      ],
    });
    const checkpoint = {
      key: "chatgpt",
      cursor: "cursor-1",
      checkedAt: 456,
    };

    expect(await repository.upsertMany([conversation], checkpoint)).toEqual({
      conversationsSaved: 1,
      messagesSaved: 2,
      conversationsUnchanged: 0,
    });
    expect(await repository.getCounts()).toEqual({
      conversationCount: 1,
      messageCount: 2,
    });
    expect(await repository.getCheckpoint("chatgpt")).toEqual(checkpoint);
    expect(await repository.upsertMany([conversation])).toEqual({
      conversationsSaved: 0,
      messagesSaved: 0,
      conversationsUnchanged: 1,
    });
  });
});

describe("sync message guards", () => {
  it("recognizes only the current sync message contracts", () => {
    expect(isSyncNowMessage({ type: "smart-folder:sync-now" })).toBe(true);
    expect(isSyncNowMessage({ type: "smart-folder:sync-now", platform: "chatgpt" })).toBe(true);
    expect(isSyncNowMessage({ type: "smart-folder:request-sync-now" })).toBe(false);
    expect(isRequestSyncNowMessage({ type: "smart-folder:request-sync-now" })).toBe(true);
    expect(isRequestSyncNowMessage({ type: "smart-folder:sync-now" })).toBe(false);
  });
});
