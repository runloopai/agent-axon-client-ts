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
 * Error thrown when the system reports a fatal error
 * (e.g. agent binary not found, process crash).
 *
 * @category Errors
 */
export class SystemError extends Error {
  constructor(message: string, cause?: string | Error) {
    super(message);
    this.name = "SystemError";
    this.cause = cause;
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
  return (
    event.origin === SYSTEM_EVENT_ORIGIN &&
    event.event_type === SYSTEM_ERROR_EVENT_TYPE
  );
}
