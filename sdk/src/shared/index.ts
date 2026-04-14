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

export { resolveReplayTarget } from "./connect-guards.js";
export {
  ConnectionStateError,
  type ConnectionStateErrorCode,
  isConnectionStateError,
} from "./errors/connection-state-error.js";
export { InitializationError } from "./errors/initialization-error.js";
export { SystemError, type SystemErrorEventInfo } from "./errors/system-error.js";
export { runDisconnectHook } from "./lifecycle.js";
export { ListenerSet } from "./listener-set.js";
export { makeDefaultOnError, makeLogger } from "./logging.js";
export { getLastSequence } from "./replay.js";
export {
  type ClassifyConfig,
  createClassifier,
  isSystemEventType,
  SYSTEM_EVENT_TYPES,
  tryParseSystemEvent,
  tryParseTimelinePayload,
} from "./timeline.js";
export type {
  BrokerErrorTimelineEvent,
  TurnCompletedTimelineEvent,
  TurnStartedTimelineEvent,
} from "./timeline-event-guards.js";
export {
  isBrokerErrorEvent,
  isSystemTimelineEvent,
  isTurnCompletedEvent,
  isTurnStartedEvent,
  isUnknownTimelineEvent,
} from "./timeline-event-guards.js";
export { timelineEventGenerator } from "./timeline-generator.js";
/** @category Types */
/** @category Timeline */
export type {
  AxonEventListener,
  AxonEventView,
  BaseConnectionOptions,
  BaseTimelineEvent,
  LogFn,
  SystemEvent,
  SystemTimelineEvent,
  TimelineEventListener,
  UnknownTimelineEvent,
} from "./types.js";
export {
  type ExtractedACPUserMessage,
  type ExtractedClaudeUserMessage,
  type ExtractedUserMessage,
  extractACPUserMessage,
  extractClaudeUserMessage,
} from "./user-message.js";
