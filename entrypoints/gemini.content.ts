import { syncGeminiHistory } from "../src/providers/gemini/gemini-sync";
import { getStorageCounts } from "../src/storage/storage-client";
import mountApp from "../src/renderer/root-attach/observer";

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_idle",

  async main() {
    try {
      mountApp();

      const summary = await syncGeminiHistory();

      if (summary === null) {
        console.info("[smart-folder] Gemini sync already running");
        return;
      }

      const counts = await getStorageCounts();

      console.info("[smart-folder] Gemini sync finished", {
        ...summary,
        ...counts,
      });

      if (summary.failures.length > 0) {
        console.warn(
          "[smart-folder] Gemini conversations that failed to normalize",
          summary.failures,
        );
      }
    } catch (error) {
      console.error("[smart-folder] Gemini sync failed", error);
    }
  },
});
