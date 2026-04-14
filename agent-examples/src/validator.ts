/**
 * Waits up to `ms` for `predicate` to return true, polling every 100ms.
 */
export async function waitFor(predicate: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !predicate()) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Wraps a promise with a timeout.
 * On timeout the original promise keeps running; pass an AbortSignal to cancel it.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(`Aborted: ${label}`));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error(`Timeout (${ms}ms): ${label}`));
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(`Aborted: ${label}`));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    promise
      .then((value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}
