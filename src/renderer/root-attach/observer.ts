import { ensureApp } from "./MountEl";

let watchdogStarted = false;

const mountApp = async (): Promise<void> => {
  console.log("[ai-workspace] mountApp()");

  // Call
  ensureApp();

  if (watchdogStarted) return;
  watchdogStarted = true;

  new MutationObserver(ensureApp).observe(document.body, {
    childList: true,
    subtree: true,
  });
};

export default mountApp;
