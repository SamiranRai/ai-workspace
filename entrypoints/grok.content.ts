import { createGrokSource } from "../src/providers/grok/grok-source";
import mountApp from "../src/renderer/app/root-attach/observer";
import { startProviderWatcher } from "../src/sync/provider-watcher";

export default defineContentScript({
  matches: ["https://grok.com/*"],
  runAt: "document_idle",

  main(ctx) {
    mountApp();
    const stop = startProviderWatcher("grok", createGrokSource, { probe: true });
    ctx.onInvalidated(stop);
  },
});
