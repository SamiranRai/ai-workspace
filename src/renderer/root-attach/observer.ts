import { browser } from "wxt/browser";
import { openSearch, resetApp } from "./MountEl";

const mountApp = async (): Promise<void> => {
  resetApp();

  const handleOpenSearch = (message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "OPEN_SEARCH"
    ) {
      openSearch();
    }
  };

  const handleShortcut = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      openSearch();
    }
  };

  browser.runtime.onMessage.addListener(handleOpenSearch);
  document.addEventListener("keydown", handleShortcut);
};

export default mountApp;
