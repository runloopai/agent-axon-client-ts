/**
 * Type guards for narrowing {@link ACPTimelineEvent} to client-side protocol events.
 *
 * Use these to identify client-side protocol events in `onTimelineEvent`
 * callbacks. The guards check both the event kind and the specific method name.
 *
 * @example
 * ```typescript
 * conn.onTimelineEvent((event) => {
 *   if (isElicitationRequestEvent(event)) {
 *     // Agent is asking for user input
 *     console.log("Elicitation request:", event.data);
 *   }
 *   if (isElicitationResponseEvent(event)) {
 *     // Client responded to elicitation
 *     console.log("Elicitation response:", event.data);
 *   }
 * });
 * ```
 *
 * @module
 */

import { CLIENT_METHODS } from "@agentclientprotocol/sdk";
import type { ACPOtherProtocolTimelineEvent, ACPTimelineEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Elicitation timeline event types
// ---------------------------------------------------------------------------

/**
 * A timeline event for `session/elicitation` (agent requesting user input).
 *
 * Check `axonEvent.origin` to determine direction:
 * - `AGENT_EVENT` = agent sent the request
 * - `USER_EVENT` = client sent the response
 *
 * @category Timeline
 */
export type ElicitationTimelineEvent = ACPOtherProtocolTimelineEvent & {
  eventType: typeof CLIENT_METHODS.session_elicitation;
};

/**
 * A timeline event for `session/elicitation/complete` notification.
 *
 * @category Timeline
 */
export type ElicitationCompleteTimelineEvent = ACPOtherProtocolTimelineEvent & {
  eventType: typeof CLIENT_METHODS.session_elicitation_complete;
};

// ---------------------------------------------------------------------------
// Elicitation timeline event guards
// ---------------------------------------------------------------------------

/**
 * Type guard for `session/elicitation` timeline events (request from agent).
 *
 * This matches when the agent asks the client for user input. The request
 * arrives as an `AGENT_EVENT`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an elicitation request from the agent.
 * @category Timeline
 */
export function isElicitationRequestEvent(
  event: ACPTimelineEvent,
): event is ElicitationTimelineEvent {
  return (
    event.kind === "acp_protocol" &&
    event.eventType === CLIENT_METHODS.session_elicitation &&
    event.axonEvent.origin === "AGENT_EVENT"
  );
}

/**
 * Type guard for `session/elicitation` timeline events (response from client).
 *
 * This matches when the client responds to an elicitation request. The response
 * arrives as a `USER_EVENT`.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an elicitation response from the client.
 * @category Timeline
 */
export function isElicitationResponseEvent(
  event: ACPTimelineEvent,
): event is ElicitationTimelineEvent {
  return (
    event.kind === "acp_protocol" &&
    event.eventType === CLIENT_METHODS.session_elicitation &&
    event.axonEvent.origin === "USER_EVENT"
  );
}

/**
 * Type guard for `session/elicitation/complete` timeline events.
 *
 * This notification is sent by the agent after it has processed the
 * elicitation response.
 *
 * @param event - The timeline event to test.
 * @returns `true` if `event` is an elicitation complete notification.
 * @category Timeline
 */
export function isElicitationCompleteEvent(
  event: ACPTimelineEvent,
): event is ElicitationCompleteTimelineEvent {
  return (
    event.kind === "acp_protocol" && event.eventType === CLIENT_METHODS.session_elicitation_complete
  );
}
