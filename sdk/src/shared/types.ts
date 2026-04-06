/**
 * Shared types used by both the ACP and Claude connection modules.
 */

export type { AxonEventView } from "@runloop/api-client/resources/axons";

import type { AxonEventView } from "@runloop/api-client/resources/axons";

/**
 * Callback invoked for every Axon event (before protocol-specific processing).
 *
 * @param event - The raw {@link AxonEventView} from the Axon SSE feed,
 *   including events from all origins (agent, user, system).
 *
 * @category Configuration
 */
export type AxonEventListener = (event: AxonEventView) => void;

/**
 * Common connection options shared by both ACP and Claude connections.
 *
 * @category Configuration
 */
export interface BaseConnectionOptions {
  /**
   * When `true`, emit timestamped diagnostic logs to `stderr` for every
   * transport read/write and lifecycle event.
   * Useful during development; too noisy for production.
   *
   * @defaultValue `false`
   */
  verbose?: boolean;

  /**
   * Called when a non-critical error occurs (e.g. unparseable event,
   * listener exception). Defaults to `console.error`.
   */
  onError?: (error: unknown) => void;

  /**
   * Async teardown callback invoked by `disconnect()` (e.g. devbox shutdown).
   */
  onDisconnect?: () => void | Promise<void>;
}
