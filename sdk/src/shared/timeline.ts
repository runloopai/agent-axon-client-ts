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
  const raw = event.axonEvent.payload;
  if (typeof raw !== "string") return (raw as T) ?? null;
  try {
    return JSON.parse(raw) as T;
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
    const parsed = parseTimelinePayload<Record<string, unknown>>({ axonEvent: ev });
    if (!parsed) return null;
    const turnId = (parsed.turn_id as string) ?? "";
    if (ev.event_type === "turn.started") {
      return { type: "turn.started", turnId };
    }
    return {
      type: "turn.completed",
      turnId,
      stopReason: parsed.stop_reason as string | undefined,
    };
  }

  if (ev.event_type === "broker.error") {
    const parsed = parseTimelinePayload<Record<string, unknown>>({ axonEvent: ev });
    const message =
      typeof parsed === "object" && parsed !== null
        ? ((parsed.message as string) ?? String(ev.payload))
        : String(ev.payload ?? "");
    return { type: "broker.error", message };
  }

  return null;
}
