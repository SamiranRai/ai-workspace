import { createClaudeSource } from "../src/providers/claude/claude-source";
import mountApp from "../src/renderer/root-attach/observer";
import { startProviderWatcher } from "../src/sync/provider-watcher";

export default defineContentScript({
  matches: ["https://claude.ai/*"],
  runAt: "document_idle",

  main(ctx) {
    mountApp();
    const stop = startProviderWatcher("claude", createClaudeSource, { probe: true });
    ctx.onInvalidated(stop);
  },
});
