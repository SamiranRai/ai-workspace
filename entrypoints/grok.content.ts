import { syncGrokHistory } from "../src/providers/grok/grok-sync";
import { getStorageCounts } from "../src/storage/storage-client";
import mountApp from "../src/renderer/root-attach/observer";

export default defineContentScript({
  matches: ["https://grok.com/*"],
  runAt: "document_idle",

  async main() {
    try {
      mountApp();

      const summary = await syncGrokHistory();

      if (summary === null) {
        console.info("[smart-folder] Grok sync already running");
        return;
      }

      const counts = await getStorageCounts();

      console.info("[smart-folder] Grok sync finished", {
        ...summary,
        ...counts,
      });

      if (summary.failures.length > 0) {
        console.warn(
          "[smart-folder] Grok conversations that failed to normalize",
          summary.failures,
        );
      }
    } catch (error) {
      console.error("[smart-folder] Grok sync failed", error);
    }
  },
});
