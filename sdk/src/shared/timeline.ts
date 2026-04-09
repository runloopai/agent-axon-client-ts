/**
 * Utility helpers for working with timeline events.
 */

import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { SystemEvent } from "./types.js";

/**
 * Parses the JSON payload from an Axon event.
 * Returns `null` if the payload is missing or not valid JSON.
 *
 * @category Timeline
 */
export function parseTimelinePayload<T = unknown>(event: { axonEvent: AxonEventView }): T | null {
  try {
    return JSON.parse(event.axonEvent.payload) as T;
  } catch {
    return null;
  }
}

/**
 * Attempts to parse a `SYSTEM_EVENT` Axon event into a typed {@link SystemEvent}.
 * Returns `null` if the event is not a recognized system event or the payload
 * cannot be parsed.
 *
 * @category Timeline
 */
export function tryParseSystemEvent(ev: AxonEventView): SystemEvent | null {
  if (ev.event_type === "turn.started" || ev.event_type === "turn.completed") {
    try {
      const parsed = JSON.parse(ev.payload) as Record<string, unknown>;
      const turnId = (parsed.turn_id as string) ?? "";
      if (ev.event_type === "turn.started") {
        return { type: "turn.started", turnId };
      }
      return {
        type: "turn.completed",
        turnId,
        stopReason: parsed.stop_reason as string | undefined,
      };
    } catch {
      return null;
    }
  }
  return null;
}
