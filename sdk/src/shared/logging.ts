/**
 * Shared logging and error-handling utilities for connection modules.
 */

import type { LogFn } from "./types.js";

/**
 * Creates a default error handler that writes to stderr with a label prefix.
 *
 * @param label - Identifier prepended to each error log (e.g. `"ACPAxonConnection"`).
 * @returns An `(error: unknown) => void` function suitable for the `onError` option.
 *
 * @category Utilities
 */
export function makeDefaultOnError(label: string): (error: unknown) => void {
  return (error: unknown) => {
    console.error(`[${label}]`, error);
  };
}

/**
 * Creates a timestamped diagnostic logger that writes to stderr.
 *
 * When called, the returned function only logs if `verbose` is `true`.
 *
 * @param prefix - Subsystem prefix (e.g. `"acp-sdk"`, `"claude-sdk"`).
 * @param verbose - When `false`, the returned function is a no-op.
 * @returns A `(tag, ...args) => void` logging function.
 *
 * @category Utilities
 */
export function makeLogger(prefix: string, verbose: boolean): LogFn {
  if (!verbose) return () => {};
  return (tag: string, ...args: unknown[]) => {
    const ts = new Date().toISOString().slice(11, 23);
    console.error(`[${ts}] [${prefix}:${tag}]`, ...args);
  };
}
