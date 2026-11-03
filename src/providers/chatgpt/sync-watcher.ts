import { reconcileChatGPTHistory } from "./chatgpt-reconcile";
import { syncChatGPTHistory } from "./chatgpt-sync";
import { CHATGPT_IDB_HOOK_CHANNEL } from "./hook-channel";
import {
  ChatGPTSourceReader,
  compareCursors,
  type SourceCursor,
} from "./source-reader";

const DEBOUNCE_MS = 1_500;
const PROBE_INTERVAL_MS = 5_000;
const RECONCILE_START_DELAY_MS = 30_000;
const RECONCILE_INTERVAL_MS = 15 * 60_000;
const HELD_RETRY_DELAYS_MS = [2_000, 6_000, 20_000];

let activeStop: (() => void) | null = null;

export function startChatGPTSyncWatcher(): () => void {
  activeStop?.();
  const controller = new AbortController();
  const { signal } = controller;
  const loggedErrors = new Set<string>();
  let running = false;
  let rerun = false;
  let needsReconcile = false;
  let heldAttempts = 0;
  let knownHead: SourceCursor | null = null;
  let debounceTimer: number | undefined;
  let retryTimer: number | undefined;

  const schedule = () => {
    if (signal.aborted) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void run(), DEBOUNCE_MS);
  };
  const requestReconcile = () => {
    needsReconcile = true;
    schedule();
  };
  const run = async () => {
    if (signal.aborted) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        const summary = await syncChatGPTHistory({
          acceptPartial: heldAttempts >= HELD_RETRY_DELAYS_MS.length,
          signal,
        });
        knownHead = summary.head;
        if (summary.held) {
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(
            schedule,
            HELD_RETRY_DELAYS_MS[Math.min(heldAttempts, HELD_RETRY_DELAYS_MS.length - 1)],
          );
          heldAttempts++;
        } else {
          heldAttempts = 0;
        }
        if (needsReconcile) {
          needsReconcile = false;
          await reconcileChatGPTHistory(signal);
        }
      } while (rerun && !signal.aborted);
    } catch (error) {
      if (!signal.aborted) handleError(error);
    } finally {
      running = false;
    }
  };
  const probe = async () => {
    if (signal.aborted || running || document.visibilityState !== "visible") return;
    const reader = new ChatGPTSourceReader();
    try {
      await reader.open();
      const head = await reader.readHead(signal);
      if (head && (!knownHead || compareCursors(head, knownHead) !== 0)) schedule();
    } catch {
      // The next probe retries a missing or upgrading source database.
    } finally {
      reader.close();
    }
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { channel?: unknown; op?: unknown } | null;
    if (data?.channel !== CHATGPT_IDB_HOOK_CHANNEL) return;
    if (data.op === "delete") needsReconcile = true;
    schedule();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") schedule();
  };
  const handleError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Extension context invalidated")) {
      stop();
      return;
    }
    if (loggedErrors.has(message)) return;
    loggedErrors.add(message);
    console.error("[smart-folder] chatgpt sync failed", error);
  };
  const stop = () => {
    controller.abort();
    window.clearTimeout(debounceTimer);
    window.clearTimeout(retryTimer);
    window.clearTimeout(startReconcileTimer);
    window.clearInterval(probeTimer);
    window.clearInterval(reconcileTimer);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("focus", schedule);
    window.removeEventListener("pageshow", schedule);
    document.removeEventListener("visibilitychange", onVisibility);
    if (activeStop === stop) activeStop = null;
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("focus", schedule);
  window.addEventListener("pageshow", schedule);
  document.addEventListener("visibilitychange", onVisibility);
  const probeTimer = window.setInterval(() => void probe(), PROBE_INTERVAL_MS);
  const startReconcileTimer = window.setTimeout(requestReconcile, RECONCILE_START_DELAY_MS);
  const reconcileTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") requestReconcile();
  }, RECONCILE_INTERVAL_MS);
  activeStop = stop;
  schedule();
  return stop;
}
