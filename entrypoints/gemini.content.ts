import { createGeminiSource } from "../src/providers/gemini/gemini-source";
import mountApp from "../src/renderer/app/root-attach/observer";
import { startProviderWatcher } from "../src/sync/provider-watcher";

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_idle",

  main(ctx) {
    mountApp();
    const stop = startProviderWatcher("gemini", createGeminiSource, { probe: true });
    ctx.onInvalidated(stop);
  },
});
