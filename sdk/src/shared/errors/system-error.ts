import type { AxonEventView } from "@runloop/api-client/resources/axons";

/**
 * Axon event type for system errors (e.g. agent binary not found).
 * @category Constants
 * @internal
 */
export const SYSTEM_ERROR_EVENT_TYPE = "broker.error";

/**
 * Axon event origin for system-generated events.
 * @category Constants
 * @internal
 */
export const SYSTEM_EVENT_ORIGIN = "SYSTEM_EVENT";

/**
 * Metadata from the Axon event that triggered the system error.
 * Uses a structural type rather than the full `AxonEventView` for testability.
 *
 * @category Types
 */
export interface SystemErrorEventInfo {
  event_type: string;
  sequence?: number;
  axon_id?: string;
}

/**
 * Error thrown when the system reports a fatal error
 * (e.g. agent binary not found, process crash).
 *
 * Includes metadata from the originating Axon event for logging, telemetry,
 * and programmatic error handling.
 *
 * @category Errors
 */
export class SystemError extends Error {
  /** The Axon event type that triggered this error (e.g. `"broker.error"`). */
  readonly eventType: string;
  /** The sequence number of the event in the Axon stream, if available. */
  readonly sequence: number | undefined;
  /** The Axon ID where the error occurred, if available. */
  readonly axonId: string | undefined;

  constructor(message: string, event?: SystemErrorEventInfo, options?: ErrorOptions) {
    super(message, options);
    this.name = "SystemError";
    this.eventType = event?.event_type ?? SYSTEM_ERROR_EVENT_TYPE;
    this.sequence = event?.sequence;
    this.axonId = event?.axon_id;
  }

  /**
   * Creates a SystemError from an Axon event.
   *
   * @param event - The Axon event containing the error payload and metadata.
   * @param options - Optional ErrorOptions for cause chaining.
   * @returns A new SystemError with message and metadata extracted from the event.
   *
   * @category Factory
   */
  static fromEvent(
    event: { payload: string; event_type: string; sequence?: number; axon_id?: string },
    options?: ErrorOptions,
  ): SystemError {
    return new SystemError(event.payload, event, options);
  }
}

/**
 * Checks whether an Axon event is a system error.
 *
 * System errors indicate fatal failures such as the agent binary not being found.
 *
 * @param event - The Axon event to check.
 * @returns `true` if the event is a system error.
 *
 * @category Utilities
 * @internal
 */
export function isSystemError(event: AxonEventView): boolean {
  return event.origin === SYSTEM_EVENT_ORIGIN && event.event_type === SYSTEM_ERROR_EVENT_TYPE;
}
