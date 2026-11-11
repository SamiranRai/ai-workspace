import { createChatGPTSource } from "../src/providers/chatgpt/chatgpt-source";
import mountApp from "../src/renderer/app/root-attach/observer";
import { startProviderWatcher } from "../src/sync/provider-watcher";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  main(ctx) {
    try {
      // @LATER_ADD: add this to a global content script not one content script
      mountApp();
    } catch (error) {
      console.error("[smart-folder] mounting the app failed", error);
    }

    const stop = startProviderWatcher("chatgpt", createChatGPTSource, {
      probe: true,
    });
    ctx.onInvalidated(stop);
  },
});
