import { logger } from "../src/shared/logging/logger";

export default defineContentScript({
  matches: ["*://*.google.com/*"],
  main() {
    logger.info("[ai-workspace] content script started");
  },
});
