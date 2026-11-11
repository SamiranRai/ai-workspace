import { browser } from "wxt/browser";

import type { AIProvider } from "../shared/models/conversation";
import type { ProviderSource } from "../providers/provider-source";
import { syncProvider, type SyncSummary } from "./sync-engine";
import { isSyncNowMessage } from "../shared/contracts/sync-messages";
import { logger } from "../shared/logging/logger";

const DEBOUNCE_MS = 1_500;
const RETRY_DELAYS_MS = [2_000, 6_000, 20_000];
const ERROR_PAUSE_MS = 30_000;
const FAST_PROBE_MS = 5_000;
const SLOW_PROBE_MS = 30_000;
const SETTLE_WINDOW_MS = 120_000;
const RESCAN_INTERVAL_MS = 60 * 60_000;

export interface WatcherOptions {
  /** Peek at the source periodically to notice changes. Leave out for sources that can't be peeked cheaply. */
  probe?: boolean;
}

const active = new Map<AIProvider, () => void>();

export function startProviderWatcher(
  platform: AIProvider,
  createSource: () => ProviderSource,
  options: WatcherOptions = {},
): () => void {
  active.get(platform)?.();

  const controller = new AbortController();
  const { signal } = controller;
  const loggedErrors = new Set<string>();

  let running = false;
  let rerun = false;
  let needsRescan = false;
  let retries = 0;
  let pausedUntil = 0;
  let lastActivityAt = Date.now();
  let knownHead: string | null = null;
  let syncTimer: number | undefined;
  let probeTimer: number | undefined;

  const touch = () => {
    lastActivityAt = Date.now();
  };

  const schedule = (delay = DEBOUNCE_MS) => {
    if (signal.aborted) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => void run(), delay);
  };

  const run = async () => {
    if (signal.aborted) return;
    if (running) {
      rerun = true; // a trigger during a run must not be lost
      return;
    }

    running = true;
    try {
      do {
        rerun = false;

        const fromStart = needsRescan;
        const summary = await syncProvider(createSource(), { signal, fromStart });
        if (fromStart) needsRescan = false;

        knownHead = summary.head;
        if (summary.saved > 0) touch();
        report(platform, summary);

        if (summary.pending > 0 && retries < RETRY_DELAYS_MS.length) {
          schedule(RETRY_DELAYS_MS[retries++]);
        } else {
          retries = 0;
        }
      } while (rerun && !signal.aborted);
    } catch (error) {
      if (!signal.aborted) handleError(error);
    } finally {
      running = false;
    }
  };

  const probe = async () => {
    if (signal.aborted || running || Date.now() < pausedUntil) return;

    const source = createSource(); // short-lived: never hold the provider's database open
    try {
      await source.open();
      const head = await source.head(signal);
      if (head !== null && head !== knownHead) schedule();
    } catch {
      // Database missing or mid-upgrade. The next tick tries again.
    } finally {
      source.close();
    }
  };

  // Fast while the tab is visible or recently active, slow otherwise. Never off.
  const probeDelay = () =>
    document.visibilityState === "visible" ||
    Date.now() - lastActivityAt < SETTLE_WINDOW_MS
      ? FAST_PROBE_MS
      : SLOW_PROBE_MS;

  const loopProbe = () => {
    if (signal.aborted || !options.probe) return;
    probeTimer = window.setTimeout(async () => {
      await probe();
      loopProbe();
    }, probeDelay());
  };

  const onTrigger = () => {
    touch();
    schedule();
  };

  // The user is leaving: copy right now, don't wait for the debounce.
  const onLeave = () => {
    touch();
    schedule(0);
  };

  const onVisibility = () =>
    document.visibilityState === "visible" ? onTrigger() : onLeave();

  const onPoke = (message: unknown) => {
    if (
      isSyncNowMessage(message) &&
      (!message.platform || message.platform === platform)
    ) {
      onLeave();
    }
  };

  // Hourly safety net: re-read everything once to heal anything an earlier run skipped.
  const requestRescan = () => {
    needsRescan = true;
    schedule();
  };

  function handleError(error: unknown): void {
    pausedUntil = Date.now() + ERROR_PAUSE_MS;
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Extension context invalidated")) {
      stop();
      return;
    }
    if (loggedErrors.has(message)) return;
    loggedErrors.add(message);
    logger.error(`[smart-folder] ${platform} sync failed`, error);
  }

  function stop(): void {
    controller.abort();
    window.clearTimeout(syncTimer);
    window.clearTimeout(probeTimer);
    window.clearInterval(rescanTimer);
    window.removeEventListener("focus", onTrigger);
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("pageshow", onTrigger);
    window.removeEventListener("pagehide", onLeave);
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      browser.runtime.onMessage.removeListener(onPoke);
    } catch {
      // The extension context is already gone.
    }
    if (active.get(platform) === stop) active.delete(platform);
  }

  window.addEventListener("focus", onTrigger);
  window.addEventListener("blur", onLeave);
  window.addEventListener("pageshow", onTrigger);
  window.addEventListener("pagehide", onLeave);
  document.addEventListener("visibilitychange", onVisibility);
  browser.runtime.onMessage.addListener(onPoke);
  const rescanTimer = window.setInterval(requestRescan, RESCAN_INTERVAL_MS);

  active.set(platform, stop);
  logger.debug(`[smart-folder] ${platform} watcher started`);
  schedule();
  loopProbe();
  return stop;
}

function report(platform: string, summary: SyncSummary): void {
  const line = `[smart-folder] ${platform} sync: scanned ${summary.scanned}, saved ${summary.saved}, pending ${summary.pending}, failures ${summary.failures.length}`;

  if (summary.saved > 0 || summary.failures.length > 0) {
    logger.info(line);
  } else {
    logger.debug(line);
  }
  if (summary.failures.length > 0) {
    logger.warn(`[smart-folder] ${platform} sync failures`, summary.failures);
  }
}
