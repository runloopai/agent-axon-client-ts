/**
 * Origin guards for determining the source of Axon events.
 *
 * These helpers work with both raw `AxonEventView` objects and timeline events
 * (which contain an `axonEvent` property). Use them instead of comparing
 * `origin` strings directly.
 *
 * @example
 * ```typescript
 * // With a timeline event
 * conn.onTimelineEvent((event) => {
 *   if (isFromAgent(event)) {
 *     console.log("Event from agent:", event.axonEvent.event_type);
 *   }
 * });
 *
 * // With a raw AxonEventView
 * conn.onAxonEvent((axonEvent) => {
 *   if (isFromUser(axonEvent)) {
 *     console.log("Event from user:", axonEvent.event_type);
 *   }
 * });
 * ```
 *
 * @module
 */

import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { BaseTimelineEvent } from "./types.js";

/**
 * Union type for objects that have an origin, either directly (AxonEventView)
 * or via an axonEvent property (timeline events).
 */
type HasOrigin = AxonEventView | BaseTimelineEvent;

/**
 * AxonEventView narrowed to agent origin.
 * @category Origin
 */
export type AgentOriginEvent<T extends HasOrigin = AxonEventView> = T & { origin: "AGENT_EVENT" };

/**
 * AxonEventView narrowed to user origin.
 * @category Origin
 */
export type UserOriginEvent<T extends HasOrigin = AxonEventView> = T & { origin: "USER_EVENT" };

/**
 * Extracts the origin string from either an AxonEventView or a timeline event.
 */
function getOrigin(eventOrTimeline: HasOrigin): string {
  return "axonEvent" in eventOrTimeline ? eventOrTimeline.axonEvent.origin : eventOrTimeline.origin;
}

/**
 * Type guard that narrows an event to agent origin.
 *
 * Works with both raw `AxonEventView` objects and timeline events.
 *
 * @param event - An AxonEventView or a timeline event containing one.
 * @returns `true` if `origin === "AGENT_EVENT"`.
 * @category Origin
 */
export function isFromAgent<T extends HasOrigin>(event: T): event is T & { origin: "AGENT_EVENT" } {
  return getOrigin(event) === "AGENT_EVENT";
}

/**
 * Type guard that narrows an event to user origin.
 *
 * Works with both raw `AxonEventView` objects and timeline events.
 *
 * @param event - An AxonEventView or a timeline event containing one.
 * @returns `true` if `origin === "USER_EVENT"`.
 * @category Origin
 */
export function isFromUser<T extends HasOrigin>(event: T): event is T & { origin: "USER_EVENT" } {
  return getOrigin(event) === "USER_EVENT";
}
