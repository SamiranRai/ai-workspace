import { syncChatGPTHistory } from "../src/providers/chatgpt/chatgpt-sync";
import { getStorageCounts } from "../src/storage/storage-client";
import mountApp from "../src/renderer/root-attach/observer";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  async main() {
    try {
      // Testing
      // @LATER_ADD: add this to a global content script not one content script
      mountApp();

      const summary = await syncChatGPTHistory();
      if (!summary) return; // another tab is already syncing

      const counts = await getStorageCounts();
      console.info("[smart-folder] ChatGPT sync finished", {
        ...summary,
        ...counts,
      });

      if (summary.failures.length > 0) {
        console.warn(
          "[smart-folder] conversations that failed to normalize",
          summary.failures,
        );
      }
    } catch (error) {
      console.error("[smart-folder] ChatGPT sync failed", error);
    }
  },
});
