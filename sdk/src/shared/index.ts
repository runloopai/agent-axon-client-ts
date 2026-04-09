/**
 * Shared types and utilities used by both the ACP and Claude connection modules.
 *
 * @categoryDescription Types
 * Common types shared by both the ACP and Claude connection modules.
 *
 * @categoryDescription Utilities
 * Internal helpers for lifecycle management, logging, and listener dispatch.
 *
 * @module
 */

export { runDisconnectHook } from "./lifecycle.js";
export { ListenerSet } from "./listener-set.js";
export { makeDefaultOnError, makeLogger } from "./logging.js";
export { parseTimelinePayload, tryParseSystemEvent } from "./timeline.js";
export { timelineEventGenerator } from "./timeline-generator.js";
/** @category Types */
/** @category Timeline */
export type {
  AxonEventListener,
  AxonEventView,
  BaseConnectionOptions,
  SystemEvent,
  SystemTimelineEvent,
  TimelineEventListener,
  UnrecognizedTimelineEvent,
} from "./types.js";
export {
  type ExtractedUserMessage,
  extractACPUserMessage,
  extractClaudeUserMessage,
} from "./user-message.js";
