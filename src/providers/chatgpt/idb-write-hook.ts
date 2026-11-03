import { CHATGPT_IDB_HOOK_CHANNEL } from "./hook-channel";

const DB_NAME = "ChatHistoryDB";
const WATCHED_STORES = new Set(["conversationMeta", "conversations"]);
const INSTALLED = "__smartFolderIdbHook";

export function installChatGPTIdbWriteHook(): void {
  const globalScope = window as unknown as Record<string, unknown>;
  if (globalScope[INSTALLED]) return;
  globalScope[INSTALLED] = true;
  const transactions = new WeakMap<IDBTransaction, { deleted: boolean }>();

  const track = (transaction: IDBTransaction, method: string) => {
    const existing = transactions.get(transaction);
    if (existing) {
      existing.deleted ||= method === "delete" || method === "clear";
      return;
    }
    const state = { deleted: method === "delete" || method === "clear" };
    transactions.set(transaction, state);
    transaction.addEventListener("complete", () => {
      window.postMessage(
        { channel: CHATGPT_IDB_HOOK_CHANNEL, op: state.deleted ? "delete" : "write" },
        location.origin,
      );
    });
  };
  const storeOf = (source: IDBObjectStore | IDBIndex): IDBObjectStore =>
    source instanceof IDBIndex ? source.objectStore : source;

  const patch = (
    prototype: object,
    method: string,
    resolveStore: (self: unknown) => IDBObjectStore,
  ) => {
    const target = prototype as Record<string, (...args: unknown[]) => unknown>;
    const original = target[method];
    if (!original) return;
    target[method] = function (this: unknown, ...args: unknown[]) {
      try {
        const store = resolveStore(this);
        if (
          store.transaction.db.name === DB_NAME &&
          WATCHED_STORES.has(store.name)
        ) {
          track(store.transaction, method);
        }
      } catch {
        // Instrumentation must never affect page behavior.
      }
      return Reflect.apply(original, this, args);
    };
  };

  for (const method of ["put", "add", "delete", "clear"]) {
    patch(IDBObjectStore.prototype, method, (store) => store as IDBObjectStore);
  }
  for (const method of ["update", "delete"]) {
    patch(IDBCursor.prototype, method, (cursor) =>
      storeOf((cursor as IDBCursor).source),
    );
  }
}
