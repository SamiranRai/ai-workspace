import { useEffect } from "react";
import { browser, type PublicPath } from "wxt/browser";

type ProviderContentScript = Extract<
  PublicPath,
  `/content-scripts/${string}.js`
>;

const getProviderContentScript = (
  url: string | undefined,
): ProviderContentScript => {
  if (!url) throw new Error("The active tab URL is unavailable.");

  const hostname = new URL(url).hostname;
  if (hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com")) {
    return "/content-scripts/chatgpt.js";
  }
  if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) {
    return "/content-scripts/claude.js";
  }
  if (
    hostname === "gemini.google.com" ||
    hostname.endsWith(".gemini.google.com")
  ) {
    return "/content-scripts/gemini.js";
  }
  if (hostname === "grok.com" || hostname.endsWith(".grok.com")) {
    return "/content-scripts/grok.js";
  }

  throw new Error("The active tab is not a supported AI site.");
};

const sendOpenSearch = async (tabId: number) => {
  try {
    await browser.tabs.sendMessage(tabId, { type: "OPEN_SEARCH" });
  } catch (error) {
    // Replace a stale page instance left behind by an extension reload.
    await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.getElementById("aiworkspace-root")?.remove();
      },
    });

    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const contentScript = getProviderContentScript(activeTab.url);

    console.info("[smart-folder] injecting the provider content script", {
      contentScript,
      reason: error instanceof Error ? error.message : "No message receiver.",
    });
    await browser.scripting.executeScript({
      target: { tabId },
      files: [contentScript],
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await browser.tabs.sendMessage(tabId, { type: "OPEN_SEARCH" });
        return;
      } catch (retryError) {
        if (attempt === 2) throw retryError;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
};

const openSearchInActiveTab = async () => {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab.id === undefined) {
      throw new Error("No active tab is available.");
    }

    await sendOpenSearch(activeTab.id);
  } catch (error) {
    console.error(
      "[smart-folder] failed to open search in the active tab",
      error,
    );
  } finally {
    window.close();
  }
};

const App = () => {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.close();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <main className="popup" aria-label="AI workspace">
      <section className="intro">
        <div className="brand">
          <img
            className="brand__icon"
            src="/icon/mark-a-cube.svg"
            alt=""
            width="40"
            height="40"
          />
          <span className="brand__name">Ai workspace</span>
        </div>
        <p className="intro__description">
          A workspace that lives inside the AI sites you already use.
        </p>
      </section>

      <section className="features" aria-label="Workspace features">
        <article className="feature-card feature-card--search">
          <p className="feature-card__eyebrow">Available now · Global Search</p>
          <button
            className="open-search"
            type="button"
            onClick={() => void openSearchInActiveTab()}
          >
            <img src="/icon/search.svg" alt="" width="17" height="17" />
            <span>Open Search</span>
          </button>
          <div className="shortcuts">
            <p className="shortcuts__label">Shortcuts:</p>
            <div className="shortcut-row">
              <span>Open Search</span>
              <kbd>command + x</kbd>
            </div>
            <div className="shortcut-row">
              <span>Close Search</span>
              <kbd>Esc</kbd>
            </div>
          </div>
        </article>

        <article className="feature-card feature-card--folders">
          <p className="feature-card__eyebrow">Coming Next</p>
          <div className="folders-copy">
            <p className="folders-copy__title">Folders</p>
            <p>Organize chats from every AI into one workspace.</p>
          </div>
        </article>
      </section>

      <footer className="footer">
        <p>
          Beta: still improving. Hit a problem? Tell us and we’ll fix it fast.
        </p>
        <button className="report-bug" type="button">
          Report Bug
        </button>
      </footer>
    </main>
  );
};

export default App;
