/**
 * Type guards for narrowing {@link ClaudeTimelineEvent} to specific variants.
 *
 * Use these to discriminate the timeline event union in `onTimelineEvent`
 * callbacks or when processing events from `receiveTimelineEvents()`.
 *
 * @example
 * ```typescript
 * conn.onTimelineEvent((event) => {
 *   if (isClaudeAssistantTextEvent(event)) {
 *     // event.data is SDKAssistantMessage with at least one text block
 *     console.log("Got assistant text");
 *   }
 *   if (isClaudeResultEvent(event)) {
 *     console.log("Turn complete:", event.data.subtype);
 *   }
 *   if (isTurnStartedEvent(event)) {
 *     console.log("Turn started:", event.data.turnId);
 *   }
 * });
 * ```
 *
 * @module
 */

import { SYSTEM_EVENT_TYPES } from "../shared/timeline.js";
import type { SystemTimelineEvent, UnknownTimelineEvent } from "../shared/types.js";
import type {
  ClaudeAssistantTimelineEvent,
  ClaudeControlRequestTimelineEvent,
  ClaudeControlResponseTimelineEvent,
  ClaudeProtocolTimelineEvent,
  ClaudeQueryTimelineEvent,
  ClaudeResultTimelineEvent,
  ClaudeSystemInitTimelineEvent,
  ClaudeTimelineEvent,
} from "./types.js";

// ---------------------------------------------------------------------------
// System event guards
// ---------------------------------------------------------------------------

/**
 * Type guard for system timeline events (turn lifecycle, broker errors).
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link SystemTimelineEvent}.
 * @category Timeline
 */
export function isSystemTimelineEvent(event: ClaudeTimelineEvent): event is SystemTimelineEvent {
  return event.kind === "system";
}

/**
 * Narrowed type for a `turn.started` system event.
 * @category Timeline
 */
export type TurnStartedTimelineEvent = SystemTimelineEvent & {
  data: { type: "turn.started"; turnId: string };
};

/**
 * Type guard for `turn.started` system events.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a turn-started system event.
 * @category Timeline
 */
export function isTurnStartedEvent(event: ClaudeTimelineEvent): event is TurnStartedTimelineEvent {
  return event.kind === "system" && event.data.type === SYSTEM_EVENT_TYPES.TURN_STARTED;
}

/**
 * Narrowed type for a `turn.completed` system event.
 * @category Timeline
 */
export type TurnCompletedTimelineEvent = SystemTimelineEvent & {
  data: { type: "turn.completed"; turnId: string; stopReason?: string };
};

/**
 * Type guard for `turn.completed` system events.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a turn-completed system event.
 * @category Timeline
 */
export function isTurnCompletedEvent(
  event: ClaudeTimelineEvent,
): event is TurnCompletedTimelineEvent {
  return event.kind === "system" && event.data.type === SYSTEM_EVENT_TYPES.TURN_COMPLETED;
}

/**
 * Narrowed type for a `broker.error` system event.
 * @category Timeline
 */
export type BrokerErrorTimelineEvent = SystemTimelineEvent & {
  data: { type: "broker.error"; message: string };
};

/**
 * Type guard for `broker.error` system events.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a broker error system event.
 * @category Timeline
 */
export function isBrokerErrorEvent(event: ClaudeTimelineEvent): event is BrokerErrorTimelineEvent {
  return event.kind === "system" && event.data.type === SYSTEM_EVENT_TYPES.BROKER_ERROR;
}

// ---------------------------------------------------------------------------
// Claude protocol event guards
// ---------------------------------------------------------------------------

/**
 * Type guard for Claude protocol timeline events.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link ClaudeProtocolTimelineEvent}.
 * @category Timeline
 */
export function isClaudeProtocolEvent(
  event: ClaudeTimelineEvent,
): event is ClaudeProtocolTimelineEvent {
  return event.kind === "claude_protocol";
}

/**
 * Type guard for Claude assistant message events.
 *
 * After narrowing, `event.data` is an `SDKAssistantMessage`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link ClaudeAssistantTimelineEvent}.
 * @category Timeline
 */
export function isClaudeAssistantEvent(
  event: ClaudeTimelineEvent,
): event is ClaudeAssistantTimelineEvent {
  return event.kind === "claude_protocol" && event.eventType === "assistant";
}

/**
 * Type guard for Claude assistant message events containing non-empty text.
 *
 * This is a compound guard that narrows to `ClaudeAssistantTimelineEvent` AND
 * verifies the message contains at least one text block with non-whitespace content.
 * Replaces the common pattern:
 * ```typescript
 * if (event.kind === "claude_protocol" && event.eventType === "assistant") {
 *   if (event.data.message.content.some((b) => b.type === "text" && b.text.trim().length > 0)) {
 *     // ...
 *   }
 * }
 * ```
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an assistant event with at least one non-empty text block.
 * @category Timeline
 */
export function isClaudeAssistantTextEvent(
  event: ClaudeTimelineEvent,
): event is ClaudeAssistantTimelineEvent {
  if (!isClaudeAssistantEvent(event)) {
    return false;
  }
  const content = event.data.message?.content;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(
    (block) =>
      block != null &&
      typeof block === "object" &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string" &&
      block.text.trim().length > 0,
  );
}

/**
 * Type guard for Claude result (turn-complete) events.
 *
 * After narrowing, `event.data` is an `SDKResultMessage`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link ClaudeResultTimelineEvent}.
 * @category Timeline
 */
export function isClaudeResultEvent(
  event: ClaudeTimelineEvent,
): event is ClaudeResultTimelineEvent {
  return event.kind === "claude_protocol" && event.eventType === "result";
}

/**
 * Type guard for Claude user query events.
 *
 * After narrowing, `event.data` is an `SDKUserMessage`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link ClaudeQueryTimelineEvent}.
 * @category Timeline
 */
export function isClaudeQueryEvent(event: ClaudeTimelineEvent): event is ClaudeQueryTimelineEvent {
  return event.kind === "claude_protocol" && event.eventType === "query";
}

/**
 * Type guard for Claude system/init events (per-turn initialization).
 *
 * After narrowing, `event.data` is an `SDKSystemMessage`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link ClaudeSystemInitTimelineEvent}.
 * @category Timeline
 */
export function isClaudeSystemInitEvent(
  event: ClaudeTimelineEvent,
): event is ClaudeSystemInitTimelineEvent {
  return event.kind === "claude_protocol" && event.eventType === "system";
}

/**
 * Type guard for Claude control request events.
 *
 * After narrowing, `event.data` is an `SDKControlRequest`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link ClaudeControlRequestTimelineEvent}.
 * @category Timeline
 */
export function isClaudeControlRequestEvent(
  event: ClaudeTimelineEvent,
): event is ClaudeControlRequestTimelineEvent {
  return event.kind === "claude_protocol" && event.eventType === "control_request";
}

/**
 * Type guard for Claude control response events.
 *
 * After narrowing, `event.data` is an `SDKControlResponse`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is a {@link ClaudeControlResponseTimelineEvent}.
 * @category Timeline
 */
export function isClaudeControlResponseEvent(
  event: ClaudeTimelineEvent,
): event is ClaudeControlResponseTimelineEvent {
  return event.kind === "claude_protocol" && event.eventType === "control_response";
}

// ---------------------------------------------------------------------------
// Unknown event guard
// ---------------------------------------------------------------------------

/**
 * Type guard for unrecognized timeline events.
 *
 * These are events the SDK did not classify as system or protocol events.
 * Inspect `event.axonEvent` for raw event details.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an {@link UnknownTimelineEvent}.
 * @category Timeline
 */
export function isUnknownTimelineEvent(event: ClaudeTimelineEvent): event is UnknownTimelineEvent {
  return event.kind === "unknown";
}
