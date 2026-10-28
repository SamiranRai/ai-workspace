import { syncClaudeHistory } from "../src/providers/claude/claude-sync";
import { getStorageCounts } from "../src/storage/storage-client";
import mountApp from "../src/renderer/root-attach/observer";

export default defineContentScript({
  matches: ["https://claude.ai/*"],
  runAt: "document_idle",

  async main() {
    try {
      // Mount the Smart Folder UI on Claude.
      mountApp();

      // Sync Claude's local conversation history.
      const summary = await syncClaudeHistory();

      if (summary === null) {
        console.info("[smart-folder] Claude sync already running");
        return;
      }

      const counts = await getStorageCounts();

      console.info("[smart-folder] Claude sync finished", {
        ...summary,
        ...counts,
      });

      if (summary.failures.length > 0) {
        console.warn(
          "[smart-folder] Claude conversations that failed to normalize",
          summary.failures,
        );
      }
    } catch (error) {
      console.error("[smart-folder] Claude sync failed", error);
    }
  },
});
