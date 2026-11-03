import { describe, expect, it } from "vitest";

import { normalizeChatGPTConversation } from "../src/providers/chatgpt/conversation-normalizer";
import { db } from "../src/storage/database";
import { ConversationRepository } from "../src/storage/conversation-repository";

describe("test harness", () => {
  it("round-trips a conversation through Dexie", async () => {
    await db.records.clear();
    await db.syncState.clear();
    const repository = new ConversationRepository();
    const conversation = normalizeChatGPTConversation({
      id: "smoke",
      title: "Smoke",
      messages: [],
    });
    await repository.upsertMany([conversation]);
    expect(await repository.getByKey(conversation.key)).toEqual(conversation);
  });

  it("serializes Web Lock callers", async () => {
    const order: number[] = [];
    await Promise.all([
      navigator.locks.request("smoke", async () => {
        order.push(1);
        await Promise.resolve();
        order.push(2);
      }),
      navigator.locks.request("smoke", async () => order.push(3)),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
