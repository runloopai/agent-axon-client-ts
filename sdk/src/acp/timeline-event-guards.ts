/**
 * Type guards for narrowing {@link ACPTimelineEvent} to specific variants.
 *
 * Use these to discriminate the timeline event union in `onTimelineEvent`
 * callbacks or when processing events from `receiveTimelineEvents()`.
 *
 * @example
 * ```typescript
 * conn.onTimelineEvent((event) => {
 *   if (isSessionUpdateEvent(event)) {
 *     // event.data is SessionNotification
 *     const update = event.data.update;
 *     if (isAgentMessageChunk(update)) {
 *       console.log(update.content);
 *     }
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
  ACPInitializeTimelineEvent,
  ACPNewSessionTimelineEvent,
  ACPPromptTimelineEvent,
  ACPProtocolTimelineEvent,
  ACPSessionUpdateTimelineEvent,
  ACPTimelineEvent,
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
export function isSystemTimelineEvent(event: ACPTimelineEvent): event is SystemTimelineEvent {
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
export function isTurnStartedEvent(event: ACPTimelineEvent): event is TurnStartedTimelineEvent {
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
export function isTurnCompletedEvent(event: ACPTimelineEvent): event is TurnCompletedTimelineEvent {
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
export function isBrokerErrorEvent(event: ACPTimelineEvent): event is BrokerErrorTimelineEvent {
  return event.kind === "system" && event.data.type === SYSTEM_EVENT_TYPES.BROKER_ERROR;
}

// ---------------------------------------------------------------------------
// ACP protocol event guards
// ---------------------------------------------------------------------------

/**
 * Type guard for ACP protocol timeline events.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an {@link ACPProtocolTimelineEvent}.
 * @category Timeline
 */
export function isACPProtocolEvent(event: ACPTimelineEvent): event is ACPProtocolTimelineEvent {
  return event.kind === "acp_protocol";
}

/**
 * Type guard for `session/update` timeline events.
 *
 * After narrowing, `event.data` is a `SessionNotification` containing
 * `{ sessionId, update }` where `update` is the `SessionUpdate`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an {@link ACPSessionUpdateTimelineEvent}.
 * @category Timeline
 */
export function isSessionUpdateEvent(
  event: ACPTimelineEvent,
): event is ACPSessionUpdateTimelineEvent {
  return event.kind === "acp_protocol" && event.eventType === "session/update";
}

/**
 * Type guard for `initialize` timeline events.
 *
 * After narrowing, `event.data` is `InitializeRequest | InitializeResponse`.
 * Check `event.axonEvent.origin` to distinguish direction:
 * - `USER_EVENT` = client sent the request
 * - `AGENT_EVENT` = agent sent the response
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an {@link ACPInitializeTimelineEvent}.
 * @category Timeline
 */
export function isInitializeEvent(event: ACPTimelineEvent): event is ACPInitializeTimelineEvent {
  return event.kind === "acp_protocol" && event.eventType === "initialize";
}

/**
 * Type guard for `session/prompt` timeline events.
 *
 * After narrowing, `event.data` is `PromptRequest | PromptResponse`.
 * Check `event.axonEvent.origin` to distinguish direction.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an {@link ACPPromptTimelineEvent}.
 * @category Timeline
 */
export function isPromptEvent(event: ACPTimelineEvent): event is ACPPromptTimelineEvent {
  return event.kind === "acp_protocol" && event.eventType === "session/prompt";
}

/**
 * Type guard for `session/new` timeline events.
 *
 * After narrowing, `event.data` is `NewSessionRequest | NewSessionResponse`.
 * Check `event.axonEvent.origin` to distinguish direction.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an {@link ACPNewSessionTimelineEvent}.
 * @category Timeline
 */
export function isNewSessionEvent(event: ACPTimelineEvent): event is ACPNewSessionTimelineEvent {
  return event.kind === "acp_protocol" && event.eventType === "session/new";
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
export function isUnknownTimelineEvent(event: ACPTimelineEvent): event is UnknownTimelineEvent {
  return event.kind === "unknown";
}
