import { browser } from "wxt/browser";

import {
  handleStorageMessage,
  isStorageMessage,
} from "../src/storage/storage-handler";
import type { StorageResponse } from "../src/storage/storage-messages";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isStorageMessage(message)) return;

    void handleStorageMessage(message, sender.url)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error("[storage] Unexpected message handler failure", error);
        const response: StorageResponse = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown storage error.",
        };
        sendResponse(response);
      });

    return true;
  });
});
