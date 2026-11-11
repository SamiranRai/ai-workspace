import mountApp from "../src/renderer/app/root-attach/observer";

export default defineContentScript({
  matches: ["*://*.google.com/*"],
  main() {
    console.log("[ai-workspace] content script started");
    // try {
    //   mountApp();
    // } catch (error) {
    //   console.error("[ai-workspace] content script error", error);
    // }
  },
});
