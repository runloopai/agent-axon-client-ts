/**
 * Programmatic reason for a {@link ConnectionStateError}.
 *
 * @category Errors
 */
export type ConnectionStateErrorCode =
  | "disposed"
  | "already_connected"
  | "not_connected"
  | "already_initialized";

/**
 * Error thrown when an Axon connection is used in an invalid lifecycle state
 * (e.g. `connect()` after `disconnect()`, or calling agent methods before `connect()`).
 *
 * Inspect {@link ConnectionStateError.code} to branch without matching message text.
 *
 * @category Errors
 */
export class ConnectionStateError extends Error {
  readonly code: ConnectionStateErrorCode;

  constructor(code: ConnectionStateErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConnectionStateError";
    this.code = code;
  }
}

/**
 * Returns `true` if `err` is a {@link ConnectionStateError}.
 *
 * @category Errors
 */
export function isConnectionStateError(err: unknown): err is ConnectionStateError {
  return err instanceof ConnectionStateError;
}
