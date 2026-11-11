import { browser } from "wxt/browser";

import {
  SYNC_NOW_MESSAGE,
  isRequestSyncNowMessage,
  type SyncNowMessage,
} from "../shared/contracts/sync-messages";
import { logger } from "../shared/logging/logger";

const PROVIDER_URL_PATTERNS = [
  "https://chatgpt.com/*",
  "https://claude.ai/*",
  "https://grok.com/*",
  "https://gemini.google.com/*",
];

const HEARTBEAT_ALARM = "smart-folder:heartbeat";
const HEARTBEAT_MINUTES = 1;

// Providers write their local data a few seconds after a message,
// so follow up several times after every tab switch.
const FOLLOW_UP_DELAYS_MS = [0, 3_000, 8_000, 20_000];
const MIN_SERIES_GAP_MS = 2_000;

let followUpTimers: ReturnType<typeof setTimeout>[] = [];
let lastSeriesAt = 0;

/** Call synchronously inside the background main. It only wakes provider tabs; it never syncs. */
export function registerSyncCoordinator(): void {
  if (browser.alarms) {
    ensureHeartbeat().catch((error: unknown) => {
      logger.error("[smart-folder] could not create the heartbeat alarm", error);
    });

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === HEARTBEAT_ALARM) void pokeProviderTabs();
    });
  }

  browser.tabs.onActivated.addListener(() => pokeWithFollowUps());
  browser.windows?.onFocusChanged.addListener(() => pokeWithFollowUps());

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isRequestSyncNowMessage(message)) pokeWithFollowUps(true);
  });
}

// Creating an alarm that already exists resets its timer, so only create it when missing.
async function ensureHeartbeat(): Promise<void> {
  if (await browser.alarms.get(HEARTBEAT_ALARM)) return;
  await browser.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: HEARTBEAT_MINUTES,
  });
}

/** Rapid tab switching starts one series of pokes, not one per switch. */
function pokeWithFollowUps(force = false): void {
  const now = Date.now();
  if (!force && now - lastSeriesAt < MIN_SERIES_GAP_MS) return;
  lastSeriesAt = now;

  followUpTimers.forEach((timer) => clearTimeout(timer));
  followUpTimers = FOLLOW_UP_DELAYS_MS.map((delay) =>
    setTimeout(() => void pokeProviderTabs(), delay),
  );
}

async function pokeProviderTabs(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ url: PROVIDER_URL_PATTERNS });
    const message: SyncNowMessage = { type: SYNC_NOW_MESSAGE };

    await Promise.all(
      tabs.map((tab) =>
        tab.id === undefined
          ? undefined
          : browser.tabs.sendMessage(tab.id, message).catch(() => undefined), // tab has no content script (yet), or is discarded
      ),
    );
  } catch (error) {
    logger.error("[smart-folder] could not wake provider tabs", error);
  }
}
