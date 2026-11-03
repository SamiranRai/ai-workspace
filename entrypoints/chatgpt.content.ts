import { startChatGPTSyncWatcher } from "../src/providers/chatgpt/sync-watcher";
import mountApp from "../src/renderer/root-attach/observer";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",
  main(ctx) {
    try {
      mountApp();
    } catch (error) {
      console.error("[smart-folder] mounting the app failed", error);
    }
    ctx.onInvalidated(startChatGPTSyncWatcher());
  },
});
