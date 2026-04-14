/**
 * Wraps a promise with a timeout.
 *
 * Note: On timeout, the original promise continues running in the background.
 * Pass an AbortSignal and handle it in your promise implementation to properly
 * cancel underlying work when the timeout fires.
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
