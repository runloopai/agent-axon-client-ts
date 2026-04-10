/**
 * Utility helpers for working with timeline events.
 */

import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { SystemEvent, SystemTimelineEvent, UnknownTimelineEvent } from "./types.js";

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

// ---------------------------------------------------------------------------
// Generic classifier factory
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createClassifier}. Each protocol module provides
 * its own config to specialize the shared classification pipeline.
 *
 * @category Timeline
 */
export interface ClassifyConfig<TProtocolEvent> {
  /** Label used in error messages (e.g. `"classifyACPAxonEvent"`). */
  label: string;
  /** Returns `true` if `eventType` belongs to this protocol. */
  isProtocolEventType: (eventType: string) => boolean;
  /**
   * Converts a parsed payload into a protocol-specific timeline event.
   * Return `null` to fall through to the `unknown` classification.
   */
  toProtocolEvent: (data: unknown, ev: AxonEventView) => TProtocolEvent | null;
  /**
   * Called when a non-critical error occurs (e.g. unparseable payload).
   * Defaults to `console.warn`.
   */
  onError?: (error: unknown) => void;
}

/**
 * Creates a classifier function that maps raw Axon events into a
 * discriminated union of `SystemTimelineEvent | TProtocolEvent | UnknownTimelineEvent`.
 *
 * The shared pipeline:
 * 1. `SYSTEM_EVENT` origin -> attempt {@link tryParseSystemEvent}
 * 2. Known protocol event type -> JSON-parse payload, delegate to `toProtocolEvent`
 * 3. Everything else -> `{ kind: "unknown" }`
 *
 * @category Timeline
 */
export function createClassifier<TProtocolEvent>(
  config: ClassifyConfig<TProtocolEvent>,
): (ev: AxonEventView) => SystemTimelineEvent | TProtocolEvent | UnknownTimelineEvent {
  const reportError = config.onError ?? ((err: unknown) => console.warn(err));
  return (ev: AxonEventView) => {
    if (ev.origin === "SYSTEM_EVENT") {
      const systemEvent = tryParseSystemEvent(ev);
      if (systemEvent) {
        return { kind: "system" as const, data: systemEvent, axonEvent: ev };
      }
    }

    if (config.isProtocolEventType(ev.event_type)) {
      let data: unknown = null;
      if (typeof ev.payload === "string") {
        try {
          data = JSON.parse(ev.payload);
        } catch (err) {
          reportError(
            `[${config.label}] Failed to parse payload for event_type="${ev.event_type}": ${err}`,
          );
        }
      } else if (ev.payload != null) {
        data = ev.payload;
      }
      const result = config.toProtocolEvent(data, ev);
      if (result) return result;
    }

    return { kind: "unknown" as const, data: null, axonEvent: ev };
  };
}
