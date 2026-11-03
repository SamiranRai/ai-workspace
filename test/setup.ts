import "fake-indexeddb/auto";

interface LockOptions {
  signal?: AbortSignal;
  ifAvailable?: boolean;
}

type LockCallback = (lock: { name: string } | null) => unknown;

const tails = new Map<string, Promise<unknown>>();
const held = new Set<string>();

async function request(
  name: string,
  optionsOrCallback: LockOptions | LockCallback,
  maybeCallback?: LockCallback,
): Promise<unknown> {
  const options =
    typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
  const callback =
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  if (!callback) throw new TypeError("A lock callback is required.");
  if (options.ifAvailable && held.has(name)) return callback(null);
  options.signal?.throwIfAborted();

  const previous = tails.get(name) ?? Promise.resolve();
  const current = previous.then(async () => {
    options.signal?.throwIfAborted();
    held.add(name);
    try {
      return await callback({ name });
    } finally {
      held.delete(name);
    }
  });
  tails.set(name, current.catch(() => undefined));
  return current;
}

Object.defineProperty(navigator, "locks", {
  configurable: true,
  value: { request },
});
