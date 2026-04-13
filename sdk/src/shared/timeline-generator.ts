/**
 * Shared async generator for consuming timeline events from a listener-based
 * source. Used by both ACP and Claude connections to avoid duplicating the
 * queue-and-yield boilerplate.
 */

import type { TimelineEventListener } from "./types.js";

/**
 * Creates an async generator that yields timeline events by subscribing to
 * a listener-based source. The generator terminates when `signal` fires.
 *
 * @param subscribe - Registers a listener and returns an unsubscribe function.
 * @param signal    - AbortSignal that terminates the generator when fired.
 * @returns An async generator of timeline events.
 *
 * @category Utilities
 */
export async function* timelineEventGenerator<T>(
  subscribe: (listener: TimelineEventListener<T>) => () => void,
  signal: AbortSignal,
): AsyncGenerator<T, void, undefined> {
  const queue: T[] = [];
  let resolve: (() => void) | null = null;
  let done = false;

  const unsubscribe = subscribe((event) => {
    queue.push(event);
    resolve?.();
  });

  const onAbort = () => {
    done = true;
    resolve?.();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (!done) {
      if (queue.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: guarded by .length > 0 check above
        yield queue.shift()!;
      } else {
        await new Promise<void>((r) => {
          resolve = r;
        });
        resolve = null;
      }
    }
    while (queue.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: draining remaining items after done
      yield queue.shift()!;
    }
  } finally {
    unsubscribe();
    signal.removeEventListener("abort", onAbort);
  }
}
