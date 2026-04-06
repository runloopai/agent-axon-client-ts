/**
 * Shared lifecycle utilities for connection teardown.
 */

/**
 * Runs an optional `onDisconnect` callback with error isolation.
 *
 * If the callback throws, the error is logged and forwarded to the
 * provided error handler rather than propagating to the caller.
 *
 * @param fn       - The disconnect callback to invoke, or `undefined` to skip.
 * @param log      - Logger function for diagnostic output.
 * @param onError  - Error handler to receive any thrown errors.
 *
 * @category Utilities
 */
export async function runDisconnectHook(
  fn: (() => void | Promise<void>) | undefined,
  log: (tag: string, ...args: unknown[]) => void,
  onError: (error: unknown) => void,
): Promise<void> {
  if (!fn) return;
  try {
    await fn();
    log("disconnect", "onDisconnect callback completed");
  } catch (err) {
    log("disconnect", `onDisconnect callback error: ${err}`);
    onError(err);
  }
}
