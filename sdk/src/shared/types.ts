/**
 * Shared types used by both the ACP and Claude connection modules.
 */

/** @category Configuration */
export type { AxonEventView } from "@runloop/api-client/resources/axons";

import type { AxonEventView } from "@runloop/api-client/resources/axons";

// ---------------------------------------------------------------------------
// Timeline events — unified event stream types
// ---------------------------------------------------------------------------

/**
 * Broker-emitted system event recognized by the SDK.
 * These bracket agent turns on the Axon channel.
 *
 * @category Timeline
 */
export type SystemEvent =
  | { type: "turn.started"; turnId: string }
  | { type: "turn.completed"; turnId: string; stopReason?: string };

/**
 * A timeline event carrying a recognized broker system event.
 * @category Timeline
 */
export interface SystemTimelineEvent {
  kind: "system";
  data: SystemEvent;
  axonEvent: AxonEventView;
}

/**
 * A timeline event the SDK did not recognize. The consumer can inspect
 * `axonEvent.origin` and `axonEvent.event_type` to decide how to handle it.
 * @category Timeline
 */
export interface UnrecognizedTimelineEvent {
  kind: "unrecognized";
  data: null;
  axonEvent: AxonEventView;
}

/**
 * Listener callback for timeline events.
 * @category Timeline
 */
export type TimelineEventListener<T> = (event: T) => void;

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

  /**
   * Axon sequence number to resume from. When set, the initial SSE
   * subscription uses `{ after_sequence }` so only events **after** this
   * sequence are delivered — earlier events are skipped.
   *
   * Omit (or pass `undefined`) to replay the full event history from the
   * beginning of the Axon channel.
   *
   * Typical usage: persist `AxonEventView.sequence` from a previous
   * session and pass it here to avoid re-processing events you have
   * already seen.
   */
  afterSequence?: number;
}
